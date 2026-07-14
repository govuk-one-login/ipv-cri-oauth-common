# di-ipv-cri-oauth-common: DI IPV Credential Issuer OAuthCommon Stack

This repository is the home for a shared stack containing resources that handle the OAuth relationship with IPV Core.

This is the replacement for [common-lambdas](https://github.com/govuk-one-login/ipv-cri-common-lambdas)

## Documentation

Detailed documentation is available in the docs directory:

- [Parameters](docs/parameters.md) – Complete reference for all CloudFormation/SAR parameters, including descriptions, defaults, and valid values.
- [Outputs](docs/outputs.md) – Description of all CloudFormation stack outputs and how they can be used.
- [Integration tests](docs/integration-tests.md) - Guidance on running integration tests locally
- [Localdev testing](docs/localdev.md) - A guide on testing with localdev CRI stacks

Further information can also be found [in Confluence](https://govukverify.atlassian.net/wiki/spaces/OJ/pages/6428000475/).

## Hooks

### Pre-commit

**important:** One you've cloned the repo, run `pre-commit install` to install the pre-commit hooks.
If you have not installed `pre-commit` then please do so [here](https://pre-commit.com/).

### Check repo for secrets

Run `detect-secrets scan --baseline .secrets.baseline` to check for potential leaked secrets.

Use the keyword and secret exclusion lists in the baseline file to prevent the utility from flagging up specific strings.
