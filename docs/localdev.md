## Testing with localdev CRI stacks

Run sam build and package, authenticating with the dev AWS account for that CRI.

The latter command uploads the built code to an S3 bucket in that account and creates a new template locally that references the uploaded code

NB: for the package step, `--output-template-file` should be set with the name to use for the packaged template, and the `--resolve-s3` switch should be enabled (this creates or reuses an S3 bucket to which the SAM artifacts are pushed)

```sh
sam build -t infrastructure/template.yaml
sam package --resolve-s3 --output-template-file packaged-template.yaml
```

`packaged-template.yaml` is added to the `.gitignore`, so using that filename will help avoid it being included in a commit accidentally.

Change the CRI template, passing a string file path leading to the packaged template instead of the object containing ApplicationId and SemanticVersion

```diff
-   Location:
-       ApplicationId: arn:aws:serverlessrepo:eu-west-2:667736788427:applications/di-ipv-cri-oauth-common
-       SemanticVersion: 0.4.0
+   Location: ../../ipv-cri-oauth-common/packaged-template.yaml
```

Deploy a ‘localdev’ stack for that CRI in the same way as usual.