# Testing the GitHub Action

This guide explains how to test the ECS Express Service deployment action.

## Prerequisites

Before testing, you need:

1. **AWS Account** with ECS Express Mode enabled
2. **IAM Roles** created:
   - Task Execution Role (for ECS to pull images and write logs)
   - Infrastructure Role (for ECS Express Mode to create ALB, etc.)
3. **Container Image** pushed to ECR or another registry
4. **GitHub Repository Secrets** configured (see below)

## Setup GitHub Secrets

Go to your repository Settings → Secrets and variables → Actions, and add:

### Required Secrets:
- `ECS_EXECUTION_ROLE_ARN` - ARN of your task execution role
  - Example: `arn:aws:iam::123456789012:role/ecsTaskExecutionRole`
- `ECS_INFRASTRUCTURE_ROLE_ARN` - ARN of your infrastructure role
  - Example: `arn:aws:iam::123456789012:role/ecsInfrastructureRole`

### AWS Credentials (choose one method):

**Option 1: OIDC (Recommended)**
- `AWS_ROLE_ARN` - ARN of GitHub Actions role with OIDC trust
  - Example: `arn:aws:iam::123456789012:role/GitHubActionsRole`

**Option 2: Access Keys (Less secure, for testing only)**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

## Required IAM Permissions

### Task Execution Role
The execution role needs:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

### Infrastructure Role
The infrastructure role needs:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "elasticloadbalancing:*",
        "ec2:DescribeSubnets",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeVpcs",
        "logs:CreateLogGroup",
        "logs:DescribeLogGroups"
      ],
      "Resource": "*"
    }
  ]
}
```

### GitHub Actions Role (for OIDC)
The role used by GitHub Actions needs:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecs:CreateExpressGatewayService",
        "ecs:UpdateExpressGatewayService",
        "ecs:DescribeExpressGatewayService",
        "ecs:DescribeServices",
        "iam:PassRole"
      ],
      "Resource": "*"
    }
  ]
}
```

## Testing Methods

### Method 1: Manual Workflow Dispatch (Easiest)

1. **Push your changes to GitHub:**
   ```bash
   git add dist/
   git commit -m "Add compiled distribution"
   git push origin feature/express-service-deployment
   ```

2. **Go to GitHub Actions tab** in your repository

3. **Select "Test Express Service Deployment" workflow**

4. **Click "Run workflow"** and fill in:
   - Image: Your container image URI
   - Service name: (optional) Name for your service
   - Cluster: (optional) Cluster name, defaults to "default"
   - AWS region: Your AWS region

5. **Watch the workflow run** and check outputs

### Method 2: Test Locally with act

You can test locally using [act](https://github.com/nektos/act):

```bash
# Install act
brew install act  # macOS
# or
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash

# Run the workflow locally
act workflow_dispatch \
  --secret AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
  --secret AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
  --secret ECS_EXECUTION_ROLE_ARN=$ECS_EXECUTION_ROLE_ARN \
  --secret ECS_INFRASTRUCTURE_ROLE_ARN=$ECS_INFRASTRUCTURE_ROLE_ARN \
  --input image="123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest" \
  --input aws-region="us-east-1"
```

### Method 3: Create a Test Repository

1. **Create a new test repository** on GitHub
2. **Copy the action files** to the test repo
3. **Create a workflow** that uses the action from your branch:
   ```yaml
   uses: your-username/amazon-ecs-deploy-express-service@feature/express-service-deployment
   ```

## Testing Scenarios

### Test 1: Create New Service
- Don't provide a service name
- Let AWS generate a unique name
- Verify service is created

### Test 2: Update Existing Service
- Provide an existing service name
- Change the image tag
- Verify service is updated

### Test 3: With Optional Parameters
Test with various optional inputs:
```yaml
with:
  image: ${{ github.event.inputs.image }}
  execution-role-arn: ${{ secrets.ECS_EXECUTION_ROLE_ARN }}
  infrastructure-role-arn: ${{ secrets.ECS_INFRASTRUCTURE_ROLE_ARN }}
  service: my-test-service
  cluster: production
  container-port: '8080'
  cpu: '512'
  memory: '1024'
  min-task-count: '2'
  max-task-count: '10'
  auto-scaling-metric: 'AVERAGE_CPU'
  auto-scaling-target-value: '70'
```

## Troubleshooting

### Action fails with "Input required and not supplied"
- Check that all required secrets are configured
- Verify secret names match exactly

### Action fails with "Access denied"
- Check IAM role permissions
- Verify the role ARNs are correct
- Ensure PassRole permission is granted

### Action fails with "Cluster not found"
- Verify the cluster exists in the specified region
- Check the cluster name spelling

### Action fails with "Invalid parameter"
- Check that CPU/memory combinations are valid for Fargate
- Verify all JSON inputs are properly formatted

## Viewing Results

After a successful deployment:

1. **Check GitHub Actions output** for:
   - Service ARN
   - Endpoint URL
   - Service status

2. **Verify in AWS Console**:
   - Go to ECS → Clusters → Your Cluster
   - Find your service
   - Check the service is ACTIVE
   - Test the endpoint URL

3. **Check CloudWatch Logs**:
   - Go to CloudWatch → Log groups
   - Find logs for your service
   - Verify application is running

## Next Steps

Once testing is successful:
- Implement remaining tasks (outputs, waiting for stability)
- Add more comprehensive error handling
- Create production-ready documentation
- Submit PR to main branch
