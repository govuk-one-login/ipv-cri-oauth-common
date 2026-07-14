## Stack Outputs

> **Note:** Where possible, stack outputs should be consumed instead of the SSM parameters.  
> The SSM parameters are deprecated and will be removed in a future version (exc. clients SSM parameters, these are not being moved into outputs)

| Output Name | Description |
|------------|-------------|
| DbCustomerManagedKeyID | The ID of the CMK used to encrypt DynamoDB tables at rest. Only present if `IsCustomerManagedKeyEnabled` |
| DbSessionTTL | Time to live for a session item (seconds)|
| DbSessionTableName | The name of the session table in DynamoDB |
| DbPersonIdentityTableName | The name of the person identity table in DynamoDB |
| LambdaSessionFunctionName | The name of the session function |
| LambdaAuthorizationFunctionName | The name of the authorisation function |
| LambdaAccessTokenFunctionName | The name of the access token function |
| PreMergeDevOnlyApiId | ID of the dev-only OAuth Common API. Only present if `isDev` |
| VCSigningKeyID | The ID of the KMS key used to sign VCs. Only present if IsCredentialIssuer is `true`. |
| StackName | The name of the OAuth common API stack |