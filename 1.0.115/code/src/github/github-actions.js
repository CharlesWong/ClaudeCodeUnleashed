/**
 * GitHub Actions Integration for Claude Code
 * Workflow templates and installation flow
 * Extracted from lines 40150-41443
 */

import { execSync, spawn } from 'child_process';

/**
 * Utility function to execute commands
 * @param {string} command - Command to execute
 * @param {string[]} args - Command arguments
 * @param {Object} options - Execution options
 * @returns {Promise<{code: number, stdout: string, stderr: string}>}
 */
async function exec(command, args = [], options = {}) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        code: code || 0,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });

    proc.on('error', (error) => {
      resolve({
        code: 1,
        stdout: '',
        stderr: error.message
      });
    });
  });
}

// GitHub workflow template constants
const GITHUB_WORKFLOW_TITLE = "Add Claude Code GitHub Workflow";

const CLAUDE_WORKFLOW_TEMPLATE = `name: Claude Code

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]
  pull_request_review:
    types: [submitted]

jobs:
  claude:
    if: |
      github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude') ||
      github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude') ||
      github.event_name == 'issues' && github.event.action == 'assigned' && github.event.assignee.login == 'claude-bot' ||
      github.event_name == 'pull_request_review' && contains(github.event.review.body, '@claude')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Claude Code
        id: claude
        uses: anthropics/claude-code-action@beta
        with:
          anthropic_api_key: \${{ secrets.CLAUDE_CODE_API_KEY }}

          additional_permissions: |
            allow: ["**"]

          # Optional: Specify model (defaults to Claude Sonnet 4, uncomment for Claude Opus 4.1)
          # model: "claude-opus-4-1-20250805"

          # Optional: Customize the trigger phrase (default: @claude)
          # trigger_phrase: "/claude"

          # Optional: Trigger when specific user is assigned to an issue
          # assignee_trigger: "claude-bot"

          # Optional: Allow Claude to run specific commands
          # allowed_commands: ["npm test", "npm run build"]

          # Optional: Add custom instructions for Claude to customize its behavior for your project
          # custom_instructions: |
          #   Follow our coding standards
          #   Ensure all new code has tests

          # Optional: Custom environment variables for Claude
          # claude_env: |
          #   NODE_ENV: test
`;

const CLAUDE_REVIEW_WORKFLOW_TEMPLATE = `name: Claude Code Review

on:
  pull_request:
    types: [opened, synchronize]
    # paths:
    #   - "src/**/*.ts"
    #   - "src/**/*.tsx"
    #   - "src/**/*.js"
    #   - "src/**/*.jsx"

jobs:
  claude-review:
    # Optional: Filter by PR author
    # if: github.actor != 'dependabot[bot]'

    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Claude Code Review
        id: claude-review
        uses: anthropics/claude-code-action@beta
        with:
          anthropic_api_key: \${{ secrets.CLAUDE_CODE_API_KEY }}

          # Optional: Specify model (defaults to Claude Sonnet 4, uncomment for Claude Opus 4.1)
          # model: "claude-opus-4-1-20250805"

          # Direct prompt for automated review (no @claude mention needed)
          direct_prompt: |
            Please review this pull request and provide feedback on:
            - Code quality and best practices
            - Potential bugs or issues
            - Performance considerations
            - Security concerns
            - Test coverage

            Be constructive and helpful in your feedback.

          # Optional: Use sticky comments to make Claude reuse the same comment on subsequent pushes to the same PR
          # use_sticky_comment: true

          # Optional: Different prompts for different authors
          # direct_prompt: |
          #   \${{ github.actor == 'first-time-contributor' &&
          #   'Welcome! Please review this PR from a first-time contributor. Be encouraging and provide detailed explanations for any suggestions.' ||
          #   'Please provide a thorough code review focusing on our coding standards and best practices.' }}

          # Optional: Add specific tools for running tests or linting
          # allowed_commands: ["npm test", "npm run lint"]

          # Optional: Skip review for certain conditions
          # if: |
          #   !contains(github.event.pull_request.title, '[skip review]')
`;

const CLAUDE_PR_DESCRIPTION = `## 🤖 Installing Claude Code GitHub App

This PR adds a GitHub Actions workflow that enables Claude Code integration in our repository.

### What is Claude Code?

Claude Code is an AI programming assistant that can help with:
- Bug fixes and improvements
- Documentation updates
- Implementing new features
- Code reviews and suggestions
- Writing tests
- And more!

### How it works

Once this PR is merged, we'll be able to interact with Claude by mentioning @claude in a pull request or issue comment.

### Important Notes

- **This workflow won't take effect until this PR is merged**
- **@claude mentions won't work until after the merge is complete**
- The workflow runs automatically whenever Claude is mentioned in PR or issue comments

### Security

- Claude only has access to the permissions explicitly granted in the workflow
- All Claude runs are stored in the GitHub Actions run history
- The API key is stored securely as a GitHub secret

### Next steps

1. Review and merge this PR
2. Create your API key at https://console.anthropic.com
3. Add the key as a GitHub secret named \`CLAUDE_CODE_API_KEY\`:
   \`\`\`bash
   gh secret set CLAUDE_CODE_API_KEY --repo <owner>/<repo>
   \`\`\`

After merging this PR, let's try mentioning @claude in a comment on any PR to get started!`;

/**
 * GitHub App Installation State Machine
 * Original: function s45()
 */
class GitHubAppInstaller {
  constructor() {
    this.state = {
      step: "check-gh",
      selectedRepoName: "",
      currentRepo: "",
      useCurrentRepo: false,
      apiKeyOrOAuthToken: "",
      useExistingKey: true,
      currentWorkflowInstallStep: 0,
      warnings: [],
      secretExists: false,
      useExistingSecret: true,
      workflowExists: false,
      selectedWorkflows: ["claude", "claude-review"],
      selectedApiKeyOption: "new",
      authType: "api_key"
    };
  }

  /**
   * Check GitHub CLI installation and auth
   * Original: function state()
   */
  async checkGitHubCLI() {
    const warnings = [];

    // Check if gh CLI is installed
    try {
      execSync('gh --version', { stdio: 'ignore' });
    } catch {
      warnings.push({
        title: "GitHub CLI not found",
        instructions: [
          "macOS: brew install gh",
          "Windows: winget install --id GitHub.cli",
          "Linux: See https://github.com/cli/cli#installation"
        ]
      });
    }

    // Check GitHub CLI authentication
    try {
      const authStatus = execSync('gh auth status -a', { encoding: 'utf8' });

      const scopesMatch = authStatus.match(/Token scopes:.*$/m);
      if (scopesMatch) {
        const scopes = scopesMatch[0];
        const missingScopes = [];

        if (!scopes.includes('repo')) missingScopes.push('repo');
        if (!scopes.includes('workflow')) missingScopes.push('workflow');

        if (missingScopes.length > 0) {
          return {
            error: `GitHub CLI is missing required permissions: ${missingScopes.join(", ")}.`,
            errorReason: "Missing required scopes",
            errorInstructions: [
              `Your GitHub CLI authentication is missing the "${missingScopes.join('" and "')}" scope${missingScopes.length > 1 ? 's' : ''} needed to manage GitHub Actions and secrets.`,
              "",
              "To fix this, run:",
              "gh auth refresh -s repo,workflow",
              "",
              "This will add the necessary permissions to manage workflows and secrets."
            ]
          };
        }
      }
    } catch {
      warnings.push({
        title: "GitHub CLI not authenticated",
        instructions: [
          "Run: gh auth login",
          "Follow the prompts to authenticate with GitHub",
          "Or set up authentication using environment variables or other methods"
        ]
      });
    }

    // Get current repository
    let currentRepo = "";
    try {
      currentRepo = execSync('gh repo view --json nameWithOwner -q .nameWithOwner', { encoding: 'utf8' }).trim();
    } catch {
      // Not in a repo, that's OK
    }

    return {
      warnings,
      currentRepo
    };
  }

  /**
   * Check if repository exists and user has admin access
   * Original: function J()
   */
  async checkRepositoryAccess(repoName) {
    try {
      const result = await exec("gh", ["api", `repos/${repoName}`, "--jq", ".permissions.admin"]);

      if (result.code === 0) {
        return { hasAccess: result.stdout.trim() === "true" };
      }

      if (result.stderr.includes("404") || result.stderr.includes("Not Found")) {
        return { hasAccess: false, error: "repository_not_found" };
      }

      return { hasAccess: false };
    } catch {
      return { hasAccess: false };
    }
  }

  /**
   * Check if workflow already exists
   * Original: function X()
   */
  async checkWorkflowExists(repoName) {
    try {
      const result = await exec("gh", ["api", `repos/${repoName}/contents/.github/workflows`, "--jq", ".[].name"]);

      if (result.code === 0) {
        const files = result.stdout.split('\n').filter(Boolean);
        return files.some(f => f.includes('claude') || f.includes('Claude'));
      }
    } catch {
      // No workflows directory or error accessing
    }

    return false;
  }

  /**
   * Create or update workflow file
   * Original: async function in lines 40805-40843
   */
  async createWorkflowFile(repoName, workflowPath, content, secretName) {
    // Check if file exists to get SHA for update
    let sha = null;
    const shaResult = await exec("gh", ["api", `repos/${repoName}/contents/${workflowPath}`, "--jq", ".sha"]);
    if (shaResult.code === 0) {
      sha = shaResult.stdout.trim();
    }

    // Prepare content based on auth type
    let finalContent = content;
    if (secretName === "CLAUDE_CODE_OAUTH_TOKEN") {
      finalContent = content.replace(
        "anthropic_api_key: ${{ secrets.CLAUDE_CODE_API_KEY }}",
        "claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}"
      );
    } else if (secretName && secretName !== "CLAUDE_CODE_API_KEY") {
      finalContent = content.replace(
        "anthropic_api_key: ${{ secrets.CLAUDE_CODE_API_KEY }}",
        `anthropic_api_key: \${{ secrets.${secretName} }}`
      );
    }

    // Create workflow file via GitHub API
    const encoded = Buffer.from(finalContent).toString('base64');
    const args = [
      "api",
      "--method", "PUT",
      `repos/${repoName}/contents/${workflowPath}`,
      "-f", `message=Add Claude Code workflow`,
      "-f", `content=${encoded}`,
      "-f", `branch=claude-code-setup`
    ];

    if (sha) {
      args.push("-f", `sha=${sha}`);
    }

    const result = await exec("gh", args);

    if (result.code !== 0) {
      if (result.stderr.includes("422") && result.stderr.includes("sha")) {
        throw new Error("The workflow file was modified. Please pull the latest changes and try again.");
      }

      const helpText = `
Need help? Common issues:
• Not authorized → Ensure you have admin access to the repository
• File exists → The workflow may already exist, check .github/workflows/
• Network issues → Check your internet connection and GitHub status`;

      throw new Error(`Failed to create workflow file: ${result.stderr}${helpText}`);
    }

    return true;
  }

  /**
   * Create GitHub secret
   * Original: lines 40889-40901
   */
  async createSecret(repoName, secretName, secretValue) {
    const result = await exec("gh", ["secret", "set", secretName, "--body", secretValue, "--repo", repoName]);

    if (result.code !== 0) {
      const helpText = `
Need help? Common issues:
• Not authorized → Ensure you have admin access to the repository
• Secret exists → The secret may already exist, you can update it manually`;

      throw new Error(`Failed to create secret: ${result.stderr}${helpText}`);
    }

    return true;
  }

  /**
   * Create pull request with workflow
   * Original: lines 40866-40905
   */
  async createPullRequest(repoName, branchName, workflows) {
    // Create PR
    const prBody = CLAUDE_PR_DESCRIPTION;
    const prTitle = "Add Claude Code GitHub Actions workflow";

    const result = await exec("gh", [
      "pr", "create",
      "--repo", repoName,
      "--head", branchName,
      "--title", prTitle,
      "--body", prBody
    ]);

    if (result.code !== 0) {
      throw new Error(`Failed to create pull request: ${result.stderr}`);
    }

    return result.stdout.trim(); // PR URL
  }
}

// Export components and templates
export {
  GitHubAppInstaller,
  CLAUDE_WORKFLOW_TEMPLATE,
  CLAUDE_REVIEW_WORKFLOW_TEMPLATE,
  CLAUDE_PR_DESCRIPTION,
  GITHUB_WORKFLOW_TITLE
};