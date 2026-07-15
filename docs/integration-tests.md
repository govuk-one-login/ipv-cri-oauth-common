## Run Cucumber tests

Below runs and uses the core stub, with the following defaults:

- DEFAULT_CLIENT_ID="ipv-core-stub-aws-build"
- ENVIRONMENT=DEV
- CRI_DEV=common-lambda-dev

NOTE: Since this is defaulting `CRI_DEV=common-lambda-dev`
`common-lambda-dev` is configured in https://github.com/govuk-one-login/ipv-config/blob/main/stubs/di-ipv-core-stub/cris-dev.yaml#L42
and contains keys configured for the common lambda account `di-ipv-cri-common-dev`the `API_GATEWAY_ID_PRIVATE` can be found
in the output of the common lambda stack being targeted i.e the value of `PreMergeDevOnlyApiId` output.

```sh
STACK_NAME=di-ipv-cri-common-api-your-stack-name ENVIRONMENT=dev API_GATEWAY_ID_PRIVATE=xxxx IPV_CORE_STUB_BASIC_AUTH_USER=xxxx IPV_CORE_STUB_BASIC_AUTH_PASSWORD=xxxx IPV_CORE_STUB_URL="https://cri.core.stubs.account.gov.uk" gradle integration-tests:cucumber`
```

Below runs overriding default stub by using the AWS stub

```sh
STACK_NAME=di-ipv-cri-common-api-your-stack-name ENVIRONMENT=dev API_GATEWAY_ID_PRIVATE=xxxx IPV_CORE_STUB_BASIC_AUTH_USER=xxxx IPV_CORE_STUB_BASIC_AUTH_PASSWORD=xxxx IPV_CORE_STUB_URL="https://cri.core.build.stubs.account.gov.uk" DEFAULT_CLIENT_ID=ipv-core-stub-aws-prod gradle integration-tests:cucumber
```

You can run against localhost as follows:

NOTE: Since this is defaulting `CRI_DEV=common-lambda-dev`
`common-lambda-dev` is configured in https://github.com/govuk-one-login/ipv-config/blob/main/stubs/di-ipv-core-stub/cris-dev.yaml#L42
and contains keys configured for the common lambda account `di-ipv-cri-common-dev`the `API_GATEWAY_ID_PRIVATE` can be found
in the output of the common lambda stack being targeted i.e the value of `PreMergeDevOnlyApiId` output.

```sh
STACK_NAME=di-ipv-cri-common-api-your-stack-name ENVIRONMENT=dev API_GATEWAY_ID_PRIVATE=xxxx IPV_CORE_STUB_BASIC_AUTH_USER=xxxx IPV_CORE_STUB_BASIC_AUTH_PASSWORD=xxxx IPV_CORE_STUB_URL="https://cri.core.build.stubs.account.gov.uk" gradle integration-tests:cucumber
```

Run in KBV CRI specify `CRI_DEV=kbv-cri-dev` allows the command below to use keys in `ipv-config` pointing to keys in `di-ipv-cri-kbv-dev` for a common lambda stack deploy in that account.

```sh
CRI_DEV=kbv-cri-dev STACK_NAME=di-ipv-cri-common-api-your-stack-name ENVIRONMENT=dev API_GATEWAY_ID_PRIVATE=xxxx IPV_CORE_STUB_BASIC_AUTH_USER=xxxx IPV_CORE_STUB_BASIC_AUTH_PASSWORD=xxxx IPV_CORE_STUB_URL="https://cri.core.build.stubs.account.gov.uk" gradle integration-tests:cucumber
```

Run in ADDRESS CRI specify `CRI_DEV=address-cri-dev` allow the command below to use keys in `ipv-config` pointing to keys in `di-ipv-cri-address-dev` for a common lambda stack deploy in that account.

```sh
CRI_DEV=address-cri-dev STACK_NAME=di-ipv-cri-common-api-your-stack-name ENVIRONMENT=dev API_GATEWAY_ID_PRIVATE=xxxx IPV_CORE_STUB_BASIC_AUTH_USER=xxxx IPV_CORE_STUB_BASIC_AUTH_PASSWORD=xxxx IPV_CORE_STUB_URL="https://cri.core.build.stubs.account.gov.uk" gradle integration-tests:cucumber
```

You can run against localhost as follows:

```sh
STACK_NAME=di-ipv-cri-common-api-your-stack-name CRI_DEV=kbv-cri-dev ENVIRONMENT=dev API_GATEWAY_ID_PRIVATE=xxxx IPV_CORE_STUB_BASIC_AUTH_USER=xxxx IPV_CORE_STUB_BASIC_AUTH_PASSWORD=xxxx IPV_CORE_STUB_URL="http://localhost:8085" gradle integration-tests:cucumber
```

NOTE: The common-lambda stack has an extra `/pre-merge-create-auth-code` endpoint which it uses to create an authorization code which it needs as prerequisite to test certain paths, since it is not a CRI itself (since it just a collection of common endpoints used by CRI's).