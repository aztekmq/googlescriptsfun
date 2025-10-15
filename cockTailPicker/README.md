# Cocktail Picker Deployment and Configuration Guide

## Summary
This document provides prescriptive guidance for deploying, configuring, and maintaining the Cocktail Picker Google Apps Script solution. The instructions target novice IT professionals and are written in the style of Industry Standard's technical documentation: procedural, comprehensive, and explicit about prerequisites and validation steps. After completing this guide you will have a fully functioning solution that can provide cocktail recommendations via the OpenAI Chat Completions API while emitting verbose logs for troubleshooting.

## Audience profile
- **Primary role:** Novice to intermediate IT administrators or support engineers responsible for Google Workspace automation.
- **Required experience:** Basic familiarity with Google Drive, Sheets, or Docs. Prior exposure to Google Apps Script is helpful but not required.
- **Out-of-scope knowledge:** No prior understanding of the OpenAI API is necessary; key concepts are introduced below.

## Solution architecture overview
| Component | Location | Purpose |
| --- | --- | --- |
| `Code.gs` | Apps Script server-side runtime | Processes form submissions, calls the OpenAI Chat Completions API, and returns structured cocktail suggestions. Verbose server-side logging is automatically applied through the `logVerbose_` helper. |
| `Index.html` | Apps Script HTML Service front end | Presents the Cocktail Picker interface, captures guest preferences, and displays responses. Verbose client-side logging is accomplished through `console.debug`, `console.info`, and `console.error` statements. |
| Script property `OPENAI_API_KEY` | Stored in **Project Settings → Script properties** | Securely stores the OpenAI API key required for outbound API calls. |

> [!IMPORTANT]
> The solution is designed according to international programming standards by using descriptive function names, inline documentation (`@fileoverview`, JSDoc annotations), and structured logging that can be interpreted by globally distributed teams.

## Prerequisites
1. A Google account with access to [Google Apps Script](https://script.google.com/).
2. An active OpenAI account with permission to use the **Chat Completions** API and a generated API key.
3. Network access that permits outbound HTTPS requests to `https://api.openai.com`.
4. Access to a desktop or laptop browser (Chrome, Edge, or Firefox are recommended).

## Deployment workflow
Follow the steps in sequence. Each step builds on the preceding one.

### 1. Create the Apps Script project
1. Navigate to [script.google.com](https://script.google.com/) and sign in.
2. Select **New project**.
3. Rename the project to **Cocktail Picker** by selecting the default project name and editing it.

### 2. Replace the default script files
1. In the Apps Script editor, delete any automatically created `.gs` file (for example `Code.gs`).
2. Create a new script file named `Code.gs` and paste the server-side content from this repository's `cockTailPicker/Code.gs` file.
3. Select **File → New → HTML file**, name it `Index`, and paste the contents from `cockTailPicker/Index.html`.
4. Press **Ctrl+S** (Windows) or **Cmd+S** (macOS) to save all files.

> [!TIP]
> When pasting the files, confirm that the header comments (`@fileoverview`) remain intact. These comments provide standardized documentation recognized across international teams.

### 3. Configure the OpenAI environment variable
The solution reads the OpenAI API key from a script property named `OPENAI_API_KEY`. Perform the following actions:

1. In the Apps Script editor, select the **Project Settings** gear icon (left navigation bar).
2. Scroll to the **Script properties** section and choose **+ Add script property**.
3. Enter the property name `OPENAI_API_KEY` (all uppercase).
4. Paste your OpenAI API key into the **Value** field.
5. (Optional but recommended) Provide a description such as `OpenAI Chat Completions authentication token`.
6. Select **Save**.

> [!NOTE]
> Script properties are encrypted at rest within Google Apps Script. Only project collaborators with edit rights can view or modify the value.

### 4. Validate environment variable access
1. Return to the **Editor** tab.
2. Open the `getOpenAIApiKey_` function in `Code.gs`.
3. Select **Run → Run function → getOpenAIApiKey_**.
4. The first execution prompts for authorization. Grant the required permissions.
5. After authorization, open the **Executions** panel. You should see a log entry similar to:
   ```
   [CocktailPicker] API key retrieval attempted. Key available: true
   ```
6. If the log reports `false`, re-enter the script property value and repeat the validation.

### 5. Deploy the web application
1. Select **Deploy → Test deployments** for iterative testing or **Deploy → Manage deployments** for production use.
2. Choose **Select type → Web app**.
3. Provide a descriptive deployment name (for example, `Initial release`).
4. Set **Execute as** to **Me (your account)**.
5. Set **Who has access** to the most appropriate audience, such as **Anyone with Google account** for trusted users.
6. Select **Deploy** and copy the web app URL.

### 6. Perform functional testing
1. Open the deployment URL in a new browser tab.
2. Complete the form with representative data.
3. Submit the form and observe the verbose logging:
   - Use the browser **Developer Tools → Console** to confirm messages prefixed with `[CocktailPicker]`.
   - In Apps Script, open the **Executions** panel to view server-side logs generated by `Logger.log`.
4. Verify that the rendered recommendation includes the cocktail name, description, ingredients list, preparation steps, and garnish guidance.

> [!CAUTION]
> If the page reports `We were unable to retrieve a cocktail suggestion`, inspect both the browser console and Apps Script logs. Typical causes include an incorrect API key, expired OpenAI quota, or a network egress restriction.

## Operational guidance

### Monitoring and verbose logging
- **Server-side logging:** The helper function `logVerbose_` automatically structures log entries. No additional configuration is required to enable verbose output.
- **Client-side logging:** Browser console statements (`console.debug`, `console.info`, and `console.error`) are provided for step-by-step visibility.
- **Retention:** Apps Script retains execution logs for 30 days. Export logs periodically if you require longer retention for compliance.

### Configuration management
- Store production API keys in a restricted Apps Script project with limited collaborators.
- When rotating the OpenAI API key, update the `OPENAI_API_KEY` script property and re-run the validation steps to confirm availability.
- Document any future script properties in this README to maintain alignment with international documentation standards.

### Security considerations
- Treat the OpenAI API key as confidential. Do not hard-code the key within `Code.gs`.
- Use least-privilege principles when sharing the project. Grant edit rights only to trusted administrators.
- Review the [OpenAI platform security documentation](https://platform.openai.com/docs/guides/safety-best-practices) for additional safeguards.

### Support and troubleshooting checklist
| Symptom | Probable cause | Resolution steps |
| --- | --- | --- |
| HTTP 401 Unauthorized | Invalid or missing `OPENAI_API_KEY` | Revalidate the script property and ensure the key is active in your OpenAI account. |
| HTTP 429 Too Many Requests | OpenAI rate limit reached | Reduce invocation frequency or upgrade your OpenAI plan. Logs will contain the exact status code for confirmation. |
| Empty or malformed cocktail response | Model returned non-JSON text | Review the execution log. The script performs a fallback parse and will raise an error with guidance if the payload is invalid. |

## Appendix A: Reference configuration values
- **OpenAI endpoint:** `https://api.openai.com/v1/chat/completions`
- **Model identifier:** `gpt-4o-mini`
- **Temperature setting:** `0.6`
- **Required script property:** `OPENAI_API_KEY`

## Appendix B: Change management notes
- Any modification to `Code.gs` or `Index.html` should maintain the existing logging statements to preserve traceability.
- Record changes in your internal change log, including date/time, editor, and summary of adjustments, to align with international audit practices.

---
For additional assistance, consult your organization's Google Workspace administrator or contact OpenAI Support for API-specific inquiries.
