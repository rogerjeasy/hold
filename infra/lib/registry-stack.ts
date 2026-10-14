import { CfnOutput, RemovalPolicy, Stack } from 'aws-cdk-lib'
import type { App, StackProps } from 'aws-cdk-lib'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import { name } from './settings.ts'

// The image registry. One image serves the web app and the worker (architecture.md section 14.2).
// App Runner services are added once the image exists, because a service cannot be created without one.

const IMAGES_KEPT = 10

export type RegistryResources = {
  readonly stack: Stack
  readonly repository: ecr.Repository
}

export function createRegistryStack(app: App, props: StackProps): RegistryResources {
  const stack = new Stack(app, 'HoldRegistry', { ...props, description: 'Hold: container images' })
  const repository = new ecr.Repository(stack, 'Repository', {
    repositoryName: name('app'),
    // A tag names one build forever, so a deployment can always say exactly what it runs.
    imageTagMutability: ecr.TagMutability.IMMUTABLE,
    imageScanOnPush: true,
    lifecycleRules: [{ description: `Keep the ${String(IMAGES_KEPT)} most recent images.`, maxImageCount: IMAGES_KEPT }],
    removalPolicy: RemovalPolicy.RETAIN,
  })
  new CfnOutput(stack, 'RepositoryUri', { value: repository.repositoryUri })
  return { stack, repository }
}
