# Issue Label to Project Field(s)

When an issue is labelled, apply one or more custom fields to it on a project the issue is associated with. The fields applied must be single select.

The mapping between issue label and field + value is maintained in a csv file. The CSV file should have headers as the first line.
One of the headers is for the label, and the other headers are the names of the custom fields you wish to set.

Each line must have a value in the label column and have the value of the single select you wish to set. You may leave fields empty if no property should be set.

## Inputs

- **`app_id`**: GitHub App ID. (Optional)
- **`app_private_key`**: GitHub App Private Key. (Optional)
- **`app_installation_id`**: GitHub App Installation ID. (Optional)
- **`token`**: GitHub Token. (Optional)

- **`csv_file_path`**: Path to the CSV file. Defaults to `.github/label-fields.csv`. (Optional)
- **`csv_label_header`**: Header for the label in the CSV file. Defaults to `Label`. (Optional)

- **`repository`**: Repository in the format `owner/repo`. Will use the current repo if none is provided. (Optional)
- **`issue_number`**: Issue number. Will use the issue that triggered the workflow if none is provided. (Optional)
- **`project_number`**: Project number. (Required)
- **`label`**: The name of the label that was applied to the issue. (Optional)

## Outputs

None

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
