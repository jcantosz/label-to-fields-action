# Issue Label to Project Field(s)

When an issue is labelled, apply one or more custom fields to it on a project the issue is associated with. At present, **the fields applied must be single select.**

The mapping between issue label and field + value is maintained in a csv file. The CSV file should have headers as the first line.
One of the headers is for the label, and the other headers are the names of the custom fields you wish to set.

Each line must have a value in the label column and have the value of the single select you wish to set. You may leave fields empty if no property should be set.

Known limits: This code does not paginate graphql results. If you have more than 100 project items associated with the issue or more than 100 fields in the specified project the code may not function as expected.

## Inputs

- **`app_id`**: GitHub App or Client (preferred) ID. (Optional)
- **`app_private_key`**: GitHub App Private Key. (Optional)
- **`app_installation_id`**: GitHub App Installation ID. (Optional)
- **`token`**: GitHub Token. (Optional)
- **`api_url`**: The URL of the GitHub API. Change this if using GHES. Defaults to `https://api.github.com` (Optional)

- **`csv_file_path`**: Path to the CSV file. Defaults to `.github/label-fields.csv`. (Optional)
- **`csv_label_header`**: Header for the label in the CSV file. Defaults to `Label`. (Optional)

- **`repository`**: Repository in the format `owner/repo`. Will use the current repo if none is provided. (Optional)
- **`issue_number`**: Issue number. Will use the issue that triggered the workflow if none is provided. (Optional)
- **`project_number`**: Project number. (Required)
- **`label`**: The name of the label that was applied to the issue. (Optional)

## Outputs

None

## Permissions

### GitHub App or Fine-grained Token

- Repository permissions
  - issues: read
  - metadata: read
- Organization permissions
  - projects: read and write

### PAT (classic)

- project
- read

## Usage

### Example CSV

```csv
Label,PM,Product Code
QuantumSync,Ravi,X7L
Vortex,Venessa,D5R
Fusion,Yuki,B9Z
Pulse,,B9Z
Eather,Sven,
```

### Example workflow

```yaml
name: Issue Label to Project Field

on:
  issues:
    types: [labeled]

jobs:
  updateFields:
    name: Update Project Fields
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Label to Fields
        uses: jcantosz/label-to-fields-action@main
        with:
          token: ${{ secrets.TOKEN }}
          project_number: 1
```

Full properties

```yaml
name: Issue Label to Project Field

on:
  issues:
    types: [labeled]

jobs:
  updateFields:
    name: Update Project Fields
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Label to Fields
        uses: jcantosz/label-to-fields-action@main
        with:
          app_id: ${{ secrets.APP_ID }}
          app_private_key: ${{ secrets.APP_PRIVATE_KEY }}
          app_installation_id: ${{ secrets.APP_INSTALLATION_ID }}

          csv_file_path: "sample/custom-label.csv"
          csv_label_header: "my_label"

          label: ${{ github.label }}
          repository: ${{ github.event.repository }}
          issue_number: ${{ github.event.issue.number }}
          project_number: 1
```

## Local setup/development

1. Install the dependencies

```bash
npm install
npm install -g @vercel/ncc # Install ncc globally if planning to update the action's dist
```

2. Create a `env.local` file, and fill in its values

```bash
cp env.local.tmpl env.local
# edit env.local with your values
```

3. Create/update the csv (`env.local` points to `sample/label-fields.csv` by default)

- First line are the headers. One should represent the issue label, the rest should be the names of fields in the project
- Every other line should be values. For the issue label column, this should be the label. For the other columns this should be the single select field text to search for

4. Run the application

```bash
npm start # Runs: ". ./env.local && node index.js"
```

5. Update `dist` with any changes

```bash
npm run build # Runs: ncc build index.js -o dist
```
