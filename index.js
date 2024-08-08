const fs = await import("fs");
const core = await import("@actions/core");
import { graphql } from "@octokit/graphql";
import * as github from "@actions/github";
const { createAppAuth } = await import("@octokit/auth-app");
const { parse } = await import("csv-parse/sync");

const payload = github.context.payload;
core.debug(`Trigger payload: ${JSON.stringify(payload)}`);

// Inputs
const csvFile = core.getInput("CSV_FILE_PATH");
const auth = {
  appId: core.getInput("APP_ID"),
  appPrivateKey: core.getInput("APP_PRIVATE_KEY"),
  appInstallationId: core.getInput("APP_INSTALLATION_ID"),
  token: core.getInput("TOKEN"),
  apiUrl: core.getInput("API_URL"),
};

const repoArr = (core.getInput("REPOSITORY") || payload?.repository?.full_name).split("/");
const org = repoArr[0],
  repo = repoArr[1];

const issueNumber = parseInt(core.getInput("ISSUE_NUMBER") || payload?.issue?.number);
const projectNumber = parseInt(core.getInput("PROJECT_NUMBER"));
const labelHeader = core.getInput("CSV_LABEL_HEADER");
const label = core.getInput("LABEL") || payload?.label?.name;

// fallback to github.com for local test
const ghBaseUrl = github.context.server_url || "github.com";
const issueLink = payload?.issue?.html_url || `https://${ghBaseUrl}/${org}/${repo}/issues/${issueNumber}`;

//
function getGraphQLAppClient() {
  const appAuth = createAppAuth({
    appId: auth.appId,
    privateKey: auth.appPrivateKey,
    installationId: auth.appInstallationId,
  });
  return graphql.defaults({
    baseUrl: auth.apiUrl,
    request: {
      hook: appAuth.hook,
    },
  });
}

function getGraphQLTokenClient() {
  return graphql.defaults({
    headers: {
      baseUrl: auth.apiUrl,
      authorization: `token ${auth.token}`,
    },
  });
}

function getGraphQLClient() {
  return auth.appId && auth.appPrivateKey && auth.appInstallationId ? getGraphQLAppClient() : getGraphQLTokenClient();
}

async function getProjectProperties(graphqlWithAuth, org, repo, issueNumber, projectNumber) {
  return await graphqlWithAuth(
    `
      query projectFields($org: String!, $repo: String!, $issueNumber: Int! $projectNumber: Int!){
        organization(login: $org){
          repository(name: $repo) {
            issue(number: $issueNumber){
              id
              projectItems(first:100){ 
                nodes{
                  id
                  project{
                    id
                  }
                }
              }
            }
          }
          projectV2(number: $projectNumber) {
            id
            fields(first: 100) {
              nodes {
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    `,
    {
      org: org,
      repo: repo,
      issueNumber: issueNumber,
      projectNumber: projectNumber,
    }
  );
}

async function updateProjectField(graphqlWithAuth, projectId, itemId, fieldId, optionId) {
  await graphqlWithAuth(
    `
      mutation updateState($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(
          input: {
            projectId: $projectId
            itemId: $itemId
            fieldId: $fieldId
            value: {
              singleSelectOptionId: $optionId
            }
          }
        ){
          projectV2Item{
            id
          }
        }
      }
    `,
    {
      projectId: projectId,
      itemId: itemId,
      fieldId: fieldId,
      optionId: optionId,
    }
  );
}

function getFieldData(fieldsList, fieldNames) {
  return fieldsList.filter((field) => fieldNames.includes(field.name));
}

function getProjectItemId(items, projectId) {
  return items.find((item) => item.project.id == projectId)?.id;
}

function getFieldId(fields, field) {
  return fields.find((item) => item.name == field)?.id;
}

function getOptionId(fields, field, option) {
  const fieldObj = fields.find((item) => item.name == field);
  return fieldObj.options.find((item) => item.name == option)?.id;
}

function readCSV(csvFile) {
  const input = fs.readFileSync(csvFile, { encoding: "utf8", flag: "r" });
  return parse(input, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true, // If opened in Excel, the BOM character added
  });
}

async function updateIssueFields(graphqlWithAuth, projectId, itemId, label, csvLine, projectKeys, fieldsData) {
  // { Label: "name", KEY1: "option", KEY2: "option"}
  core.info(`Processing label ${label}`);

  // loop through all the fields from the CSV
  for (const field of projectKeys) {
    // get the current fields' desired value
    const fieldOption = csvLine[field];
    if (fieldOption) {
      core.info(`Setting field: ${field} to ${fieldOption}`);
      // get the id for the selected options
      const fieldId = getFieldId(fieldsData, field);

      if (!fieldId) {
        throw new Error(`Field ${field} not found in project number ${projectNumber}. Typo in your CSV?`);
      }

      const fieldOptionId = getOptionId(fieldsData, field, fieldOption);

      // update the item in the project if everything is et
      if (fieldId && fieldOptionId) {
        core.debug(`Updating project (id: ${projectId})'s item (id: ${itemId}).`);
        core.debug(`\tsetting field: ${field} (id: ${fieldId}) to option: ${fieldOption} (id: ${fieldOptionId})`);

        core.summary.addRaw(`Setting field "${field}" to "${fieldOption}"`, true);
        updateProjectField(graphqlWithAuth, projectId, itemId, fieldId, fieldOptionId);
      } else {
        throw new Error(`Invalid field or option selected for label "${label}" -> ${field}:${fieldOption}`);
      }
    }
  }
}

function getProjectId(properties) {
  return properties.id;
}

function fail(message) {
  core.setFailed(message);
  process.exit();
}

async function main() {
  core.debug(`Inputs:
      csv_file: ${csvFile}
      repoArr: ${repoArr}
      org: ${org}
      repo: ${repo}
      issueNumber: ${issueNumber}q
      projectNumber: ${projectNumber}
      labelHeader: ${labelHeader}
      label: ${label}
      apiUrl: ${auth.apiUrl}
      `);
  core.info(`Issue #${issueNumber}: ${issueLink}`);
  core.summary.addLink(`Issue #${issueNumber}`, issueLink);
  // read labels
  const csv = readCSV(csvFile);
  core.debug(`csv: ${JSON.stringify(csv)}`);

  // Get all the relevant fields from the CSV for the input labels
  const csvLine = csv.find((element) => element[labelHeader] == label);
  core.debug(`csvLine: ${JSON.stringify(csvLine)}`);
  if (csvLine) {
    // Get all of the keys from the filtered item excluding the 'label' key
    const projectKeys = Object.keys(csvLine).filter((key) => key != labelHeader);
    core.debug(`projectKeys: ${projectKeys}`);

    const graphqlWithAuth = getGraphQLClient();

    // Get details about the project from graphQL
    const properties = await getProjectProperties(graphqlWithAuth, org, repo, issueNumber, projectNumber);
    core.debug(`project properties: ${JSON.stringify(properties)}`);

    const projectV2 = properties.organization.projectV2;

    const projectId = getProjectId(projectV2);

    const projectItems = properties.organization.repository.issue.projectItems.nodes;

    // Bail out if there are no project items (issue not associated with a project)
    const projectItemId = getProjectItemId(projectItems, projectId);
    if (!projectItemId) {
      fail(`Issue #${issueNumber} not attached to the project number ${projectNumber}.`);
    }

    const fieldsData = getFieldData(projectV2.fields.nodes, projectKeys);

    // for the label applied to the issue
    core.info("Updating project fields");
    try {
      updateIssueFields(graphqlWithAuth, projectId, projectItemId, label, csvLine, projectKeys, fieldsData);
    } catch (error) {
      fail(error);
    }
  } else {
    core.info(`Input label "${label}" not found in csv file (${csvFile}). No action taken.`);
    core.summary.addRaw(`Input label "${label}" not found in csv file (${csvFile}). No action taken.`, true);
  }
  core.summary.write();
}

// Overwrite unavailable function when running locally
if (process.env.NODE_ENV == "dev") {
  console.log(`
    NODE_ENV = 'dev'
    \t- core.summary.write() will only log to stdout
    `);
  core.summary.write = function () {
    console.log(`Summary details (skipping output): "${core.summary.stringify()}"`);
  };
}

main();
