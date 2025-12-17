# Amazon ECS "Deploy Express Service" Action for GitHub Actions

Deploys an Amazon ECS Express Mode service. ECS Express Mode is a simplified deployment model that automatically provisions and manages the underlying infrastructure (Application Load Balancer, target groups, security groups, etc.) for your containerized applications.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Usage](#usage)
- [Inputs](#inputs)
- [Outputs](#outputs)
- [IAM Permissions](#iam-permissions)
- [Examples](#examples)
- [Best Practices](#best-practices)


## Overview

This action creates or updates an Amazon ECS Express Mode service. Express Mode simplifies ECS deployments by:

- Automatically creating and managing Application Load Balancers
- Handling target group configuration
- Managing security groups and networking
- Providing auto-scaling capabilities
- Offering a streamlined API for common deployment patterns

The action will:
1. Check if the specified cluster exists (creates it if using the default cluster)
2. Determine if the service exists (create vs update)
3. Deploy the service with the specified configuration
4. Wait for the service and deployment to reach a stable state
5. Output the service ARN, endpoint URL, and status

## Prerequisites

### AWS Credentials

Configure AWS credentials using the `aws-actions/configure-aws-credentials` action:

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v5
  with:
    role-to-assume: arn:aws:iam::123456789012:role/my-github-actions-role
    aws-region: us-east-1
```

### IAM Roles

You need two IAM roles:

1. **Execution Role** (`execution-role-arn`): Grants ECS tasks permission to pull container images and publish logs
2. **Infrastructure Role** (`infrastructure-role-arn`): Grants ECS permission to create and manage AWS resources (ALB, target groups, security groups, etc.)

See [IAM Permissions](#iam-permissions) for detailed policy requirements.

## Usage

### Basic Example

```yaml
- name: Deploy to ECS Express Mode
  uses: aws-actions/amazon-ecs-deploy-express-service@v1
  with:
    service-name: my-service
    image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest
    execution-role-arn: arn:aws:iam::123456789012:role/ecsTaskExecutionRole
    infrastructure-role-arn: arn:aws:iam::123456789012:role/ecsInfrastructureRole
```

### Complete Example with All Options

```yaml
- name: Deploy to ECS Express Mode
  uses: aws-actions/amazon-ecs-deploy-express-service@v1
  with:
    # Required inputs
    service-name: my-service
    image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:v1.2.3
    execution-role-arn: arn:aws:iam::123456789012:role/ecsTaskExecutionRole
    infrastructure-role-arn: arn:aws:iam::123456789012:role/ecsInfrastructureRole
    
    # Service identification
    cluster: my-cluster
    
    # Container configuration
    container-port: 8080
    environment-variables: |
      [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "LOG_LEVEL", "value": "info"}
      ]
    secrets: |
      [
        {"name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:db-password"}
      ]
    command: '["node", "server.js"]'
    tags: |
      [
        {"key": "Environment", "value": "production"},
        {"key": "Team", "value": "backend"},
        {"key": "CostCenter", "value": "engineering"}
      ]
    
    # Resource configuration
    cpu: '1024'
    memory: '2048'
    task-role-arn: arn:aws:iam::123456789012:role/myTaskRole
    
    # Network configuration
    subnets: subnet-12345678,subnet-87654321
    security-groups: sg-12345678
    
    # Service configuration
    health-check-path: /health
    
    # Auto-scaling configuration
    min-task-count: 2
    max-task-count: 10
    auto-scaling-metric: AVERAGE_CPU
    auto-scaling-target-value: 70
```

## Inputs

### Required Inputs

| Input | Description |
|-------|-------------|
| `service-name` | The name of the ECS Express service. Used for both creating new services and updating existing ones. |
| `image` | The container image URI to deploy (e.g., `123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest`) |
| `execution-role-arn` | The ARN of the task execution role that grants the ECS agent permission to pull container images and publish logs |
| `infrastructure-role-arn` | The ARN of the infrastructure role that grants ECS permission to create and manage AWS resources (ALB, target groups, etc.) |

### Service Identification

| Input | Description | Default |
|-------|-------------|---------|
| `cluster` | The name of the ECS cluster | `default` |

### Container Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `container-port` | The port number on the container that receives traffic. If not specified, Express Mode will use port 80. | - |
| `environment-variables` | Environment variables as JSON array: `[{"name":"KEY","value":"VALUE"}]` | - |
| `secrets` | Secrets as JSON array: `[{"name":"KEY","valueFrom":"arn:aws:secretsmanager:..."}]` | - |
| `command` | Override container command as JSON array: `["node","server.js"]` | - |
| `log-group` | CloudWatch Logs log group name for container logs. If not specified, Express Mode creates a log group automatically. | - |
| `log-stream-prefix` | CloudWatch Logs stream prefix for container logs. If not specified, Express Mode uses a default prefix. | - |
| `repository-credentials` | ARN of the secret containing credentials for private container registry. Required for private registries outside ECR. | - |
| `tags` | Resource tags to apply to the ECS Express Gateway service and associated AWS resources. Provide as JSON array: `[{"key":"Environment","value":"Production"}]` or multiline format: `Environment=Production` | - |

### Resource Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `cpu` | The number of CPU units to allocate (256, 512, 1024, 2048, 4096, 8192, 16384). If not specified, Express Mode defaults to 1024 (1 vCPU). | - |
| `memory` | The amount of memory in MiB to allocate (512, 1024, 2048, 4096, 8192, 16384, 30720, 61440, 122880). If not specified, Express Mode defaults to 2048 MiB. | - |
| `task-role-arn` | The ARN of the IAM role that the container can assume to make AWS API calls | - |

### Network Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `subnets` | Comma-separated list of subnet IDs for the service. If not specified, Express Mode uses the default VPC. | - |
| `security-groups` | Comma-separated list of security group IDs for the service | - |

### Health Check Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `health-check-path` | The path for ALB health checks. If not specified, Express Mode defaults to /ping. | - |

### Auto-Scaling Configuration

| Input | Description | Default |
|-------|-------------|---------|
| `min-task-count` | Minimum number of tasks for auto-scaling. Must be less than or equal to max-task-count. | - |
| `max-task-count` | Maximum number of tasks for auto-scaling. Must be greater than or equal to min-task-count. | - |
| `auto-scaling-metric` | The metric to use for auto-scaling: `AVERAGE_CPU`, `AVERAGE_MEMORY`, or `REQUEST_COUNT_PER_TARGET` | - |
| `auto-scaling-target-value` | The target value for the auto-scaling metric (e.g., 60 for 60% CPU utilization) | - |

## Outputs

| Output | Description |
|--------|-------------|
| `service-arn` | The ARN of the deployed Express service |
| `endpoint` | The endpoint URL of the service (from the Application Load Balancer) |

## IAM Permissions

### Execution Role

The execution role can use the managed policy [`AmazonECSTaskExecutionRolePolicy`](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonECSTaskExecutionRolePolicy.html) permissions to pull container images and write logs. If not already created, please follow option 3c in the [procedure](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-first-run.html#express-service-first-run-procedure)


### Infrastructure Role

The infrastructure role can use the managed policy [`AmazonECSInfrastructureRoleforExpressGatewayServices`](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AmazonECSInfrastructureRoleforExpressGatewayServices.html) permissions to manage ECS Express Mode resources. If not already created, please follow option 3c in the [procedure](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-first-run.html#express-service-first-run-procedure)

### GitHub Actions Role

This action relies on the [default behavior of the AWS SDK for Javascript](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html) to determine AWS credentials and region.
Use [the `aws-actions/configure-aws-credentials` action](https://github.com/aws-actions/configure-aws-credentials) to configure the GitHub Actions environment (recommended: IAM Identity Provider in your AWS account for GitHub OIDC). You have to use these permissions to manage ECS Express services:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:CreateCluster",
        "ecs:RegisterTaskDefinition",
        "ecs:CreateExpressGatewayService",
        "ecs:UpdateExpressGatewayService",
        "ecs:DescribeExpressGatewayService",
        "ecs:DescribeClusters",
        "ecs:DescribeServices",
        "ecs:ListServiceDeployments",
        "ecs:DescribeServiceDeployments",
        "iam:PassRole"
      ],
      "Resource": "*"
    }
  ]
}
```

## Examples

### Deploy with ECR Image

```yaml
name: Deploy to ECS Express

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v5
        with:
          role-to-assume: arn:aws:iam::123456789012:role/github-actions-role
          aws-region: us-east-1
      
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2
      
      - name: Build and push image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: my-app
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
      
      - name: Deploy to ECS Express
        uses: aws-actions/amazon-ecs-deploy-express-service@v1
        with:
          service-name: my-app-service
          image: ${{ steps.login-ecr.outputs.registry }}/my-app:${{ github.sha }}
          execution-role-arn: arn:aws:iam::123456789012:role/ecsTaskExecutionRole
          infrastructure-role-arn: arn:aws:iam::123456789012:role/ecsInfrastructureRole
```

### Deploy with Environment Variables and Secrets

```yaml
- name: Deploy with configuration
  uses: aws-actions/amazon-ecs-deploy-express-service@v1
  with:
    service-name: nginx-service
    image: public.ecr.aws/nginx/nginx:latest
    execution-role-arn: arn:aws:iam::123456789012:role/ecsTaskExecutionRole
    infrastructure-role-arn: arn:aws:iam::123456789012:role/ecsInfrastructureRole
    environment-variables: |
      [
        {"name": "ENVIRONMENT", "value": "production"},
        {"name": "REGION", "value": "us-east-1"}
      ]
    secrets: |
      [
        {"name": "API_KEY", "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:api-key"},
        {"name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:us-east-1:123456789012:secret:db-pass"}
      ]
```

### Deploy with Auto-Scaling

Express Mode Services are setup with preset defaults 

```yaml
- name: Deploy with auto-scaling
  uses: aws-actions/amazon-ecs-deploy-express-service@v1
  with:
    service-name: my-app
    image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest
    execution-role-arn: arn:aws:iam::123456789012:role/ecsTaskExecutionRole
    infrastructure-role-arn: arn:aws:iam::123456789012:role/ecsInfrastructureRole
    cpu: '1024'
    memory: '2048'
    min-task-count: 2
    max-task-count: 10
    auto-scaling-metric: AVERAGE_CPU
    auto-scaling-target-value: 70
```

## Best Practices
https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-best-practices.html

### Deploy with Resource Tags

The action supports two input formats for tags:

**JSON Format**:
```yaml
- name: Deploy with tags (JSON format)
  uses: aws-actions/amazon-ecs-deploy-express-service@v1
  with:
    service-name: my-app
    image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest
    execution-role-arn: arn:aws:iam::123456789012:role/ecsTaskExecutionRole
    infrastructure-role-arn: arn:aws:iam::123456789012:role/ecsInfrastructureRole
    tags: |
      [
        {"key": "Environment", "value": "Production"},
        {"key": "Team", "value": "DevOps"},
        {"key": "CostCenter", "value": "Engineering"},
        {"key": "Project", "value": "WebApp"}
      ]
```

**Multiline Format**:
```yaml
- name: Deploy with tags (multiline format)
  uses: aws-actions/amazon-ecs-deploy-express-service@v1
  with:
    service-name: my-app
    image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest
    execution-role-arn: arn:aws:iam::123456789012:role/ecsTaskExecutionRole
    infrastructure-role-arn: arn:aws:iam::123456789012:role/ecsInfrastructureRole
    tags: |
      Environment=Production
      Team=DevOps
      CostCenter=Engineering
      Project=WebApp
```




## Troubleshooting

### Service fails to deploy

- Check that the execution role has permissions to pull the container image
- Verify the infrastructure role has permissions to create load balancers and target groups
- Ensure the container image exists and is accessible
- Check CloudWatch Logs for container startup errors

### Deployment timeout

- Check that your health check path returns 200 OK
- Verify the container is listening on the specified port

### Cluster not found error

- For custom clusters, ensure the cluster exists before running the action
- The action will automatically create the default cluster if it doesn't exist



## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.

