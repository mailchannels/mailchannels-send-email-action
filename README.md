# MailChannels Send Email Action

Send build and deployment notifications with the [MailChannels Email API](https://docs.mailchannels.com/email-api/overview).

This action is in development. Automated tests pass on Linux, macOS and Windows. A [live dry run](https://github.com/mailchannels/mailchannels-send-email-action/actions/runs/37376609924) returned HTTP 200 and validated outputs on October 5, 2026. Actual delivery has not been tested; GitHub Marketplace publication is pending.

## Setup

Configure your account and sending domain using the [quickstart](https://docs.mailchannels.com/email-api/curl/quickstart). Store your API key in the repository or organization secret `MAILCHANNELS_API_KEY`. Keep the key out of workflow files and message content. Use trusted workflows with access to that secret.

The action uses the runner's Node.js 24 runtime. Keep self-hosted runners current. No package installation or build step is required to run the action.

## Example

During development, check out this repository and invoke its root action. For production use, pin the checkout to a reviewed full commit SHA. Replace the example addresses with your configured sender and an allowed recipient. The example validates without sending; change `dry-run` to `'false'` when ready to deliver.

```yaml
name: Validate email notification
on: workflow_dispatch
permissions:
  contents: read
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          repository: mailchannels/mailchannels-send-email-action
          path: mailchannels-action
          persist-credentials: false
      - uses: ./mailchannels-action
        id: email
        with:
          api-key: ${{ secrets.MAILCHANNELS_API_KEY }}
          from: builds@example.com
          to: developer@example.com
          subject: Build notification
          text: |
            Repository: ${{ github.repository }}
            Run: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
          dry-run: 'true'
```

## Inputs

| Input | Required | Description |
| --- | --- | --- |
| `api-key` | Yes | API key from an Actions secret. |
| `from` | Yes | Bare email address on a configured sending domain. |
| `to` | Yes | Comma-separated bare email addresses, without display names. All are visible in the message's recipient list. |
| `subject` | Yes | Non-empty subject without control characters. |
| `text` | One body required | Plain-text content. |
| `html` | One body required | HTML content. Supply both bodies for multipart email. Escape untrusted content before inserting it into HTML. |
| `dry-run` | No | `true` validates without sending; default `false`. |
| `timeout-seconds` | No | Integer from 1 to 120; default 30. |

## Outputs and failures

`status` is `accepted` for a normal send (HTTP 202) or `validated` for a dry run (HTTP 200). `http-status` contains that HTTP code. Acceptance does not confirm delivery; consult delivery activity for the final result.

Invalid input, an unexpected HTTP status, or a network error fails the step. The action does not retry requests. After a timeout, the API might already have accepted the message: check delivery activity before rerunning the job. Response bodies, subjects and message content are not logged. The API key is registered with the runner's secret masker.

The action supports simple sender/recipient notifications and plain-text/HTML bodies. Attachments, CC/BCC, templates, display names and personalized recipient content are not currently exposed.

## Development

Use Node.js 24 and run `npm test`. There are no third-party runtime or test dependencies. Tests cover request payloads, validation, dry runs, errors, timeouts, secret masking and runner outputs without sending email.

Maintainers can use the **Validate live Email API** workflow after setting the repository secret `MAILCHANNELS_API_KEY`. Supply a configured sender and an allowed test recipient. That workflow always uses dry-run mode and verifies the action reports HTTP 200 and `validated`; it does not test actual delivery.

API behavior: [OpenAPI definition](https://docs.mailchannels.com/email-api.yaml). Account help: [MailChannels support](https://support.mailchannels.com/hc/en-us).
