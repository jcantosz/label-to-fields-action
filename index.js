const fs = await import("fs");
const core = await import("@actions/core");
import { graphql } from "@octokit/graphql";
import * as github from "@actions/github";
const { parse } = await import("csv-parse/sync");

const payload = github.context.payload;
core.debug(`Trigger payload: ${JSON.stringify(payload)}`);

const csvFile = core.getInput("CSV_FILE_PATH");

const auth = {
  appId: core.getInput("APP_ID"),
  appPrivateKey: core.getInput("APP_PRIVATE_KEY"),
  appInstallationId: core.getInput("APP_INSTALLATION_ID"),
  token: core.getInput("TOKEN"),
};

const repoArr = (core.getInput("REPOSITORY") || payload?.repository?.full_name).split("/");
const org = repoArr[0],
  repo = repoArr[1];

const issueNumber = core.getInput("ISSUE_NUMBER") || payload?.issue?.number;
const projectNumber = core.getInput("PROJECT_NUMBER");
const labelHeader = core.getInput("CSV_LABEL_HEADER");
const label = core.getInput("LABEL") || payload?.label?.name;

function getGraphQLAppClient() {
  const appAuth = createAppAuth({
    appId: auth.appId,
    privateKey: auth.appPrivateKey,
    installationId: auth.appInstallationId,
  });
  return graphql.defaults({
    request: {
      hook: appAuth.hook,
    },
  });
}

function getGraphQLTokenClient() {
  return graphql.defaults({
    headers: {
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
  await graphqlWithAuth(`
  mutation updateState{
    updateProjectV2ItemFieldValue(
      input: {
        projectId: "${projectId}"
        itemId: "${itemId}"
        fieldId: "${fieldId}"
        value: {
          singleSelectOptionId: "${optionId}"
        }
      }
    ){
      projectV2Item{
        id
      }
    }
  }
`);
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

async function updateIssueFields(graphqlWithAuth, projectId, itemId, label, filteredCSV, projectKeys, fieldsData) {
  // { Label: "name", KEY1: "option", KEY2: "option"}
  const labelFields = filteredCSV.find((item) => label == item[labelHeader]);
  core.info(`Processing label ${label}`);

  // loop through all the fields from the CSV
  for (const field of projectKeys) {
    // get the current fields' desired value
    const fieldOption = labelFields[field];
    if (fieldOption) {
      // get the id for the selected options
      const fieldId = getFieldId(fieldsData, field);
      const fieldOptionId = getOptionId(fieldsData, field, fieldOption);

      // update the item in the project if everything is et
      if (fieldId && fieldOptionId) {
        core.debug(`Updating project (id: ${projectId})'s item (id: ${itemId}).`);
        core.debug(`\tsetting field: ${field} (id: ${fieldId}) to option: ${fieldOption} (id: ${fieldOptionId})`);

        updateProjectField(graphqlWithAuth, projectId, itemId, fieldId, fieldOptionId);
      } else {
        core.error(`Invalid field or option selected for label "${label}" -> ${field}:${fieldOption}`);
      }
    }
  }
}

function getProjectId(properties) {
  return projectV2.id;
}

async function main() {
  core.debug(`Inputs:
      csv_file: ${csvFile}
      repoArr: ${repoArr}
      org: ${org}
      repo: ${repo}
      issueNumber: ${issueNumber}
      projectNumber: ${projectNumber}
      labelHeader: ${labelHeader}
      label: ${label}
      `);
  // read labels
  const csv = readCSV(csvFile);

  // Get all the relevant fields from the CSV for the input labels
  const filteredCSV = csv.filter((label) => label.includes(label[labelHeader]));

  // Get all of the keys from the filtered item excluding the 'label' key
  const projectKeys = Object.keys(filteredCSV[0]).filter((key) => key != labelHeader);

  const graphqlWithAuth = getGraphQLClient();

  // Get details about the project from graphQL
  const properties = await getProjectProperties(graphqlWithAuth, org, repo, issueNumber, projectNumber);

  const projectV2 = properties.organization.projectV2;

  const projectId = getProjectId(projectV2);

  const projectItems = properties.organization.repository.issue.projectItems.nodes;
  const projectItemId = getProjectItemId(projectItems, projectId);

  const fieldsData = getFieldData(projectV2.fields.nodes, projectKeys);

  // for the label applied to the issue
  updateIssueFields(graphqlWithAuth, projectId, projectItemId, label, filteredCSV, projectKeys, fieldsData);
}

main();
