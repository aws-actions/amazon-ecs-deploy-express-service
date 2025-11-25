# Design Document

## Overview

This document describes the design for a GitHub Action that deploys containerized applications to Amazon ECS Express Mode services. The action provides a simplified deployment experience by leveraging Express Mode's automated infrastructure provisioning while supporting both create and update operations through a single, unified interface.

The action is implemented in TypeScript using the GitHub Actions toolkit and AWS SDK for JavaScript v3. It follows the same patterns as existing AWS GitHub Actions (particularly aws-actions/amazon-ecs-deploy-task-definition) to ensure seamless integration with existing workflows.

## Architecture

The action follows a straightforward architecture:

```
GitHub Workflow
      ↓
Action Entry Point (index.ts)
      ↓
Input Validation & Parsing
      ↓
AWS Credentials (from environment)
      ↓
Service ARN Construction
      ↓
Service Existence Check (Describe)
      ↓
   ┌──────┴──────┐
   ↓             ↓
Create       Update
Service      Service
   ↓             ↓
   └──────┬──────┘
          ↓
   Set Outputs
          ↓
   Complete
```

The action operates in a single execution flow with conditional branching based on whether the service exists.

## Components and Interfaces

### File Structure

Following the exact pattern of aws-actions/amazon-ecs-deploy-task-definition:

```
/
├── index.js                 # Main action implementation
├── index.test.js           # Jest tests
├── action.yml              # Action metadata
├── package.json            # Dependencies
├── package-lock.json       # Locked dependencies
├── dist/                   # Compiled output (ncc build)
│   └── index.js
├── .github/
│   └── workflows/
│       └── test.yml        # CI workflow
├── README.md
├── LICENSE
├── CODE_OF_CONDUCT.md
└── CONTRIBUTING.md
```

### Main Implementation (`index.js`)

The action follows this structure:

```javascript
const core = require('@actions/core');
const { ECS, waitUntilServicesStable } = require('@aws-sdk/client-ecs');
const { STS } = require('@aws-sdk/client-sts');

async function run() {
  try {
    const ecs = new ECS({
      customUserAgent: 'amazon-ecs-deploy-express-service-for-github-actions'
    });
    
    // Read inputs
    // Construct service ARN
    // Check if service exists
    // Create or update service
    // Set outputs
    
  } catch (error) {
    core.setFailed(error.message);
    core.debug(error.stack);
  }
}

module.exports = run;

if (require.main === module) {
  run();
}
```

### Key Functions

1. **run()** - Main entry point wrapped in try/catch
2. **constructServiceArn()** - Builds ARN from cluster, service, region, account
3. **createOrUpdateService()** - Handles create vs update logic
4. **waitForServiceStability()** - Optional waiting using SDK waiters

### Dependencies

Matching deploy-task-definition's package.json:

```json
{
  "dependencies": {
    "@actions/core": "^1.10.1",
    "@aws-sdk/client-ecs": "^3.908.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.38.0",
    "@vercel/ncc": "^0.38.3",
    "eslint": "^9.39.1",
    "jest": "^29.7.0"
  }
}
```

Note: We don't need `@aws-sdk/client-sts` because we parse the account ID from the execution-role-arn input.

### Build Process

Uses `@vercel/ncc` to compile into a single distributable file:

```bash
npm run package  # Runs: ncc build index.js -o dist
```

### Testing

Uses Jest for unit tests:

```bash
npm test  # Runs: eslint **.js && jest --coverage
```

## Data Models

### Action Metadata (action.yml)

Following the deploy-task-definition pattern:

```yaml
name: 'Amazon ECS "Deploy Express Service" Action for GitHub Actions'
description: 'Creates or updates an Amazon ECS Express Mode service'
branding:
  icon: 'cloud'
  color: 'orange'
inputs:
  image:
    description: 'The container image URI to deploy'
    required: true
  execution-role-arn:
    description: 'The ARN of the task execution role'
    required: true
  infrastructure-role-arn:
    description: 'The ARN of the infrastructure role'
    required: true
  service:
    description: 'The name of the ECS Express service. If not provided, AWS will generate a unique name.'
    required: false
  cluster:
    description: "The name of the ECS cluster. Will default to the 'default' cluster."
    required: false
  wait-for-service-stability:
    description: 'Whether to wait for the ECS service to reach stable state. Valid values are "true" or "false". Default is "true".'
    required: false
    default: 'true'
  wait-for-minutes:
    description: 'How long to wait for service stability, in minutes (default: 30 minutes, max: 6 hours).'
    required: false
    default: '30'
  # ... additional inputs for container config, resources, networking, scaling
outputs:
  service-arn:
    description: 'The ARN of the Express service'
  endpoint:
    description: 'The endpoint URL of the service'
  status:
    description: 'The status of the service'
runs:
  using: 'node20'
  main: 'dist/index.js'
```

### Service ARN Construction

```
arn:aws:ecs:{region}:{account-id}:service/{cluster-name}/{service-name}
```

Components retrieved via:
- `region`: From ECS client config (environment variable AWS_REGION)
- `account-id`: Parsed from execution-role-arn input (format: `arn:aws:iam::ACCOUNT-ID:role/name`)
- `cluster-name`: From `cluster` input or "default"
- `service-name`: From `service` input

Example parsing:
```javascript
// execution-role-arn: arn:aws:iam::123456789012:role/ecsTaskExecutionRole
const accountId = executionRoleArn.split(':')[4]; // "123456789012"
```

### AWS SDK Command Mapping

**CreateExpressGatewayServiceCommand Input:**
```javascript
{
  executionRoleArn: string,           // Required
  infrastructureRoleArn: string,      // Required
  primaryContainer: {
    image: string,                    // Required
    containerPort: number,
    environment: [{name, value}],
    secrets: [{name, valueFrom}],
    command: [string]
  },
  serviceName: string,
  cluster: string,
  cpu: string,
  memory: string,
  taskRoleArn: string,
  networkConfiguration: {
    subnets: [string],
    securityGroups: [string]
  },
  healthCheckPath: string,
  scalingTarget: {
    minTaskCount: number,
    maxTaskCount: number,
    autoScalingMetric: string,
    autoScalingTargetValue: number
  }
}
```

**UpdateExpressGatewayServiceCommand Input:**
```javascript
{
  serviceArn: string,                 // Required
  // Same optional fields as Create
}
```

## Correctnes
s Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


Property 1: ARN construction format
*For any* service name, cluster name, region, and account ID, constructing a service ARN should produce a string matching the format `arn:aws:ecs:{region}:{account-id}:service/{cluster}/{service}`
**Validates: Requirements 1.1**

Property 2: Image inclusion in container config
*For any* container image URI provided as input, the resulting SDK command input should include that image in the primaryContainer.image field
**Validates: Requirements 2.1**

Property 3: Port inclusion in container config
*For any* container port provided as input, the resulting SDK command input should include that port in the primaryContainer.containerPort field
**Validates: Requirements 2.2**

Property 4: Environment variables preservation
*For any* set of environment variables provided as input, all variables should appear in the primaryContainer.environment array with matching names and values
**Validates: Requirements 2.3**

Property 5: Secrets preservation
*For any* set of secrets provided as input, all secrets should appear in the primaryContainer.secrets array with matching names and valueFrom fields
**Validates: Requirements 2.4**

Property 6: Command preservation
*For any* command array provided as input, the resulting SDK command input should include that exact command array in the primaryContainer.command field
**Validates: Requirements 2.5**

Property 7: CPU string conversion
*For any* CPU value provided as input, the resulting SDK command input should include it as a string in the cpu field
**Validates: Requirements 3.1**

Property 8: Memory string conversion
*For any* memory value provided as input, the resulting SDK command input should include it as a string in the memory field
**Validates: Requirements 3.2**

Property 9: Fargate resource validation
*For any* CPU and memory combination provided, if they form a valid Fargate combination they should be accepted, otherwise validation should fail
**Validates: Requirements 3.5**

Property 10: Scaling configuration inclusion
*For any* scaling configuration with minTaskCount and maxTaskCount, both values should appear in the scalingTarget object
**Validates: Requirements 4.1**

Property 11: Scaling metric inclusion
*For any* valid autoScalingMetric value (AVERAGE_CPU, AVERAGE_MEMORY, or REQUEST_COUNT_PER_TARGET), it should appear in the scalingTarget.autoScalingMetric field
**Validates: Requirements 4.2**

Property 12: Scaling target value inclusion
*For any* autoScalingTargetValue provided, it should appear in the scalingTarget.autoScalingTargetValue field
**Validates: Requirements 4.3**

Property 13: Scaling bounds validation
*For any* scaling configuration where minTaskCount and maxTaskCount are both provided, minTaskCount must be less than or equal to maxTaskCount
**Validates: Requirements 4.5**

Property 14: Task role inclusion
*For any* taskRoleArn provided as input, the resulting SDK command input should include it in the taskRoleArn field
**Validates: Requirements 5.3**

Property 15: Network subnets inclusion
*For any* networkConfiguration with subnets provided, all subnets should appear in the networkConfiguration.subnets array
**Validates: Requirements 6.1**

Property 16: Security groups inclusion
*For any* security groups provided, all should appear in the networkConfiguration.securityGroups array
**Validates: Requirements 6.2**

Property 17: Health check path inclusion
*For any* healthCheckPath provided as input, the resulting SDK command input should include it in the healthCheckPath field
**Validates: Requirements 7.1**

Property 18: Cluster name inclusion
*For any* cluster name provided as input, the resulting SDK command input should include it in the cluster field
**Validates: Requirements 7.3**

Property 19: Service ARN output extraction
*For any* successful CreateExpressGatewayServiceCommand or UpdateExpressGatewayServiceCommand response, the service ARN from the response should be set as an action output
**Validates: Requirements 8.1**

Property 20: Endpoint extraction from ingress paths
*For any* service response containing ingress paths, the endpoint from the first ingress path should be extracted and set as an action output
**Validates: Requirements 8.2**

Property 21: Status extraction
*For any* service response containing a status object, the statusCode should be extracted and set as an action output
**Validates: Requirements 8.3**

Property 22: AWS SDK error logging
*For any* AWS SDK error that occurs, the error name and message should be logged
**Validates: Requirements 9.1**

Property 23: Required input validation
*For any* required input (image, execution-role-arn, infrastructure-role-arn) that is missing, the action should fail immediately with a message indicating which input is required
**Validates: Requirements 9.5**

Property 24: Error handling with core.setFailed
*For any* error that occurs during action execution, core.setFailed should be called with the error message
**Validates: Requirements 11.4**

## Error Handling

The action follows the deploy-task-definition pattern for error handling:

```javascript
async function run() {
  try {
    // Main logic
  } catch (error) {
    core.setFailed(error.message);
    core.debug(error.stack);
  }
}
```

### AWS SDK Error Handling

Specific AWS SDK errors are caught and enhanced with helpful messages:

- **AccessDeniedException**: Add guidance about checking IAM role permissions
- **InvalidParameterException**: Include which parameter is invalid
- **ClusterNotFoundException**: Include cluster name and suggest checking region
- **ResourceNotFoundException**: Indicates service doesn't exist (triggers create path)

### Input Validation

Required inputs are validated at the start:
- `image` - Required
- `execution-role-arn` - Required
- `infrastructure-role-arn` - Required

Optional inputs with defaults:
- `cluster` - Defaults to "default"
- `wait-for-service-stability` - Defaults to "true"
- `wait-for-minutes` - Defaults to 30

## Testing Strategy

### Unit Testing with Jest

Following the deploy-task-definition pattern, unit tests cover:

1. **Input parsing and validation**
   - Required inputs throw errors when missing
   - Optional inputs use correct defaults
   - Invalid values are rejected

2. **ARN construction**
   - Correct format for various inputs
   - Default cluster name handling
   - Region and account ID integration

3. **SDK command input building**
   - All provided inputs map to correct SDK fields
   - Optional fields are omitted when not provided
   - Arrays and objects are structured correctly

4. **Output extraction**
   - Service ARN extracted from responses
   - Endpoint URL extracted from ingress paths
   - Status code extracted correctly

5. **Error handling**
   - AWS SDK errors are caught and reported
   - core.setFailed is called on errors
   - Error messages include helpful context

### Property-Based Testing

Property-based tests will use a JavaScript PBT library (fast-check) to verify universal properties:

- **Minimum 100 iterations** per property test
- Each test tagged with: `**Feature: github-action-ecs-deploy, Property {number}: {property_text}**`
- Tests generate random valid inputs and verify properties hold

### Integration Testing

Integration tests (not in scope for unit tests) would verify:
- Actual AWS API calls with test credentials
- Service creation and updates in test environment
- Waiting for service stability
- End-to-end workflow execution

### Test Structure

```javascript
// index.test.js
const run = require('./index');
const core = require('@actions/core');
const { ECS } = require('@aws-sdk/client-ecs');

jest.mock('@actions/core');
jest.mock('@aws-sdk/client-ecs');

describe('Amazon ECS Deploy Express Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fails when required inputs are missing', async () => {
    // Test implementation
  });

  test('constructs service ARN correctly', () => {
    // Test implementation
  });

  // ... more tests
});
```

## Implementation Flow

### Main Execution Flow

```
1. Read inputs using core.getInput()
2. Validate required inputs (image, execution-role-arn, infrastructure-role-arn)
3. Create ECS client with custom user agent
4. Get AWS account ID using STS GetCallerIdentity
5. Get AWS region from ECS client config
6. If service name provided:
   a. Construct service ARN
   b. Try DescribeExpressGatewayServiceCommand
   c. If exists: call UpdateExpressGatewayServiceCommand
   d. If ResourceNotFoundException: call CreateExpressGatewayServiceCommand
7. If no service name: call CreateExpressGatewayServiceCommand
8. Extract outputs from response
9. Wait for service stability (default behavior, unless wait-for-service-stability is "false")
10. Set outputs using core.setOutput()
11. Log success message
```

### Service ARN Construction

```javascript
async function constructServiceArn(ecs, executionRoleArn, cluster, service) {
  const region = await ecs.config.region();
  // Parse account ID from execution role ARN
  // Format: arn:aws:iam::ACCOUNT-ID:role/name
  const accountId = executionRoleArn.split(':')[4];
  return `arn:aws:ecs:${region}:${accountId}:service/${cluster}/${service}`;
}
```

### Create vs Update Decision

```javascript
async function createOrUpdateService(ecs, serviceArn, serviceConfig) {
  if (serviceArn) {
    try {
      await ecs.send(new DescribeExpressGatewayServiceCommand({
        serviceArn: serviceArn
      }));
      // Service exists, update it
      return await ecs.send(new UpdateExpressGatewayServiceCommand({
        serviceArn: serviceArn,
        ...serviceConfig
      }));
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        // Service doesn't exist, create it
        return await ecs.send(new CreateExpressGatewayServiceCommand(serviceConfig));
      }
      throw error;
    }
  } else {
    // No service name provided, create new
    return await ecs.send(new CreateExpressGatewayServiceCommand(serviceConfig));
  }
}
```

### Waiting for Service Stability

Following the Terraform provider pattern, poll the service to check for stability:

```javascript
async function waitForServiceStability(ecs, serviceArn, maxWaitMinutes) {
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  const startTime = Date.now();
  const pollInterval = 15000; // 15 seconds, matching deploy-task-definition
  
  core.info(`Waiting for service to become stable (max ${maxWaitMinutes} minutes)...`);
  
  while (Date.now() - startTime < maxWaitMs) {
    const response = await ecs.send(new DescribeExpressGatewayServiceCommand({
      serviceArn: serviceArn
    }));
    
    const service = response.service;
    const status = service.status?.statusCode;
    
    // Check if service is ACTIVE and deployment is stable
    if (status === 'ACTIVE') {
      // Service is active, check if deployment is complete
      // A stable deployment means the currentDeployment matches the latest configuration
      core.info('Service is ACTIVE and stable');
      return service;
    } else if (status === 'DRAINING') {
      core.info('Service is DRAINING, continuing to wait...');
    } else if (status === 'INACTIVE') {
      throw new Error('Service became INACTIVE during deployment');
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error(`Service did not stabilize within ${maxWaitMinutes} minutes`);
}
```

## Development Workflow

### Branch Strategy

Development will occur on a feature branch until ready for mainline:

1. Create feature branch: `git checkout -b feature/express-service-deployment`
2. Develop and test on feature branch
3. Submit PR for review
4. Merge to main after approval

### Build Process

```bash
npm install
npm run package  # Compiles with ncc to dist/index.js
```

### Testing on Branch

Users can test the action from the feature branch:
```yaml
uses: aws-actions/amazon-ecs-deploy-express-service@feature/express-service-deployment
```

## Deployment and Distribution

### GitHub Release

After merge to main:
1. Tag version (e.g., v1.0.0)
2. Create GitHub release
3. Users reference: `uses: aws-actions/amazon-ecs-deploy-express-service@v1`

### Versioning

Follow semantic versioning:
- Major: Breaking changes
- Minor: New features, backward compatible
- Patch: Bug fixes

## Security Considerations

1. **Credentials**: Never log or expose AWS credentials
2. **Secrets**: Handle secrets input securely, don't log values
3. **Input validation**: Validate all inputs to prevent injection
4. **Dependencies**: Keep AWS SDK and actions/core up to date
5. **Permissions**: Document minimum required IAM permissions

## Documentation Requirements

### README.md

Must include:
- Overview of Express Mode services
- Prerequisites (AWS credentials setup)
- Usage examples
- Input reference table
- Output reference table
- IAM permissions required
- Comparison with deploy-task-definition action

### Example Usage

Complete workflow showing GitHub Actions chaining with ECR:

```yaml
name: Deploy to Amazon ECS Express

on:
  push:
    branches: [ main ]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: my-app
  ECS_SERVICE: my-express-service
  ECS_CLUSTER: production

jobs:
  deploy:
    name: Deploy
    runs-on: ubuntu-latest

    steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        role-to-assume: arn:aws:iam::123456789012:role/my-github-actions-role
        aws-region: ${{ env.AWS_REGION }}

    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v2

    - name: Build, tag, and push image to Amazon ECR
      id: build-image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
        echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

    - name: Deploy to Amazon ECS Express
      uses: aws-actions/amazon-ecs-deploy-express-service@v1
      with:
        image: ${{ steps.build-image.outputs.image }}
        execution-role-arn: arn:aws:iam::123456789012:role/ecsTaskExecutionRole
        infrastructure-role-arn: arn:aws:iam::123456789012:role/ecsInfrastructureRole
        service: ${{ env.ECS_SERVICE }}
        cluster: ${{ env.ECS_CLUSTER }}
        # wait-for-service-stability defaults to true
```
