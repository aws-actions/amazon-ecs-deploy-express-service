# Requirements Document

## Introduction

This document specifies the requirements for a GitHub Action that deploys containerized applications to Amazon ECS Express Mode services. Express Mode is a simplified deployment API that reduces complexity by providing sensible defaults and automating the configuration of supporting AWS services (Application Load Balancer, CloudWatch, networking, auto-scaling). The action is modeled on the aws-actions/amazon-ecs-deploy-task-definition action but adapted for the Express Mode service model, which requires only three things to get started: a container image, a task execution role, and an infrastructure role.

## Glossary

- **GitHub Action**: A reusable automation unit that runs within GitHub Actions workflows
- **ECS (Elastic Container Service)**: Amazon's container orchestration service
- **Express Mode Service**: A simplified ECS service type that automates infrastructure configuration
- **ECS Service**: An ECS resource that maintains a specified number of running task instances
- **Action Input**: A parameter passed to the GitHub Action from the workflow file
- **Action Output**: A value returned by the GitHub Action for use in subsequent workflow steps
- **Deployment System**: The GitHub Action implementation that orchestrates the deployment process
- **Workflow**: A GitHub Actions workflow that uses this action
- **Container Image**: A Docker image containing the application to deploy
- **Service Deployment**: The process of creating or updating an Express Mode service with a new container image

## Requirements

### Requirement 1

**User Story:** As a developer, I want to create or update an Express Mode service from my workflow, so that I can deploy my containerized application with minimal configuration.

#### Acceptance Criteria

1. WHEN service and cluster inputs are provided, THE Deployment System SHALL construct the service ARN using the format arn:aws:ecs:region:account-id:service/cluster-name/service-name
2. WHEN no cluster input is provided, THE Deployment System SHALL use "default" as the cluster name in the ARN
3. WHEN the service ARN is constructed, THE Deployment System SHALL call DescribeExpressGatewayServiceCommand to check if the service exists
4. WHEN DescribeExpressGatewayServiceCommand succeeds, THE Deployment System SHALL update the service using UpdateExpressGatewayServiceCommand
5. WHEN DescribeExpressGatewayServiceCommand throws ResourceNotFoundException, THE Deployment System SHALL create the service using CreateExpressGatewayServiceCommand

### Requirement 2

**User Story:** As a developer, I want to specify my container configuration, so that the Express Mode service runs my application correctly.

#### Acceptance Criteria

1. WHEN a container image URI is provided as input, THE Deployment System SHALL include it in the primaryContainer configuration
2. WHERE a container port is provided, THE Deployment System SHALL include it in the primaryContainer configuration
3. WHERE environment variables are provided, THE Deployment System SHALL include them in the primaryContainer environment array
4. WHERE secrets are provided, THE Deployment System SHALL include them in the primaryContainer secrets array
5. WHERE a container command is provided, THE Deployment System SHALL include it in the primaryContainer command array

### Requirement 3

**User Story:** As a developer, I want to configure resource allocation for my service, so that my application has appropriate CPU and memory.

#### Acceptance Criteria

1. WHERE CPU value is provided, THE Deployment System SHALL include it in the service configuration as a string
2. WHERE memory value is provided, THE Deployment System SHALL include it in the service configuration as a string
3. WHERE no CPU value is provided, THE Deployment System SHALL omit it to use Express Mode default (256 CPU units or 0.25 vCPU)
4. WHERE no memory value is provided, THE Deployment System SHALL omit it to use Express Mode default (512 MiB)
5. WHEN resource values are provided, THE Deployment System SHALL validate they are valid ECS Fargate combinations

### Requirement 4

**User Story:** As a developer, I want to configure auto-scaling for my service, so that it can handle variable traffic loads.

#### Acceptance Criteria

1. WHERE a scalingTarget configuration is provided, THE Deployment System SHALL include minTaskCount and maxTaskCount
2. WHERE an autoScalingMetric is provided, THE Deployment System SHALL include it in the scalingTarget (AVERAGE_CPU, AVERAGE_MEMORY, or REQUEST_COUNT_PER_TARGET)
3. WHERE an autoScalingTargetValue is provided, THE Deployment System SHALL include it in the scalingTarget
4. WHERE no scaling configuration is provided, THE Deployment System SHALL omit it to use Express Mode defaults (auto-scaling with target value 60)
5. WHEN scaling configuration is provided, THE Deployment System SHALL validate that minTaskCount is less than or equal to maxTaskCount

### Requirement 5

**User Story:** As a developer, I want to configure IAM roles for my service, so that it has appropriate permissions for execution and infrastructure management.

#### Acceptance Criteria

1. WHEN creating a service, THE Deployment System SHALL require executionRoleArn as a mandatory input
2. WHEN creating a service, THE Deployment System SHALL require infrastructureRoleArn as a mandatory input
3. WHERE a taskRoleArn is provided, THE Deployment System SHALL include it in the service configuration
4. WHEN the execution role is invalid or lacks permissions, THE Deployment System SHALL fail with an AccessDeniedException
5. WHEN the infrastructure role is invalid or lacks permissions, THE Deployment System SHALL fail with an AccessDeniedException

### Requirement 6

**User Story:** As a developer, I want to configure networking for my service, so that I can control VPC placement and security groups.

#### Acceptance Criteria

1. WHERE a networkConfiguration is provided, THE Deployment System SHALL include subnets in the configuration
2. WHERE security groups are provided, THE Deployment System SHALL include them in the networkConfiguration
3. WHERE no networkConfiguration is provided, THE Deployment System SHALL omit it to use Express Mode defaults (default VPC with auto-created security groups)
4. WHEN networkConfiguration is provided, THE Deployment System SHALL validate that subnets exist in the same VPC
5. WHEN security groups are provided, THE Deployment System SHALL validate they exist in the same VPC as the subnets

### Requirement 7

**User Story:** As a developer, I want to configure health checks and additional service options, so that my service is monitored correctly.

#### Acceptance Criteria

1. WHERE a healthCheckPath is provided, THE Deployment System SHALL include it in the service configuration
2. WHERE no healthCheckPath is provided, THE Deployment System SHALL omit it to use Express Mode default (/ping)
3. WHERE a cluster name is provided, THE Deployment System SHALL include it in the service configuration
4. WHERE no cluster name is provided, THE Deployment System SHALL omit it to use the default cluster
5. WHERE a serviceName is provided, THE Deployment System SHALL include it, otherwise AWS SHALL generate a unique name

### Requirement 8

**User Story:** As a developer, I want clear action outputs, so that I can use deployment information in subsequent workflow steps.

#### Acceptance Criteria

1. WHEN the Express Mode service is created or updated, THE Deployment System SHALL output the service ARN
2. WHEN the service has ingress paths, THE Deployment System SHALL output the endpoint URL from the first ingress path
3. WHEN the service status is available, THE Deployment System SHALL output the status code (ACTIVE, DRAINING, or INACTIVE)
4. WHEN any output is set, THE Deployment System SHALL use the GitHub Actions core.setOutput mechanism
5. WHEN the action completes successfully, THE Deployment System SHALL ensure all outputs are available to subsequent steps

### Requirement 9

**User Story:** As a developer, I want comprehensive error handling, so that I can quickly diagnose and fix deployment issues.

#### Acceptance Criteria

1. WHEN any AWS SDK call fails, THE Deployment System SHALL capture and log the error details including error name and message
2. WHEN an AccessDeniedException occurs, THE Deployment System SHALL provide guidance about checking IAM role permissions
3. WHEN an InvalidParameterException occurs, THE Deployment System SHALL indicate which parameter is invalid
4. WHEN a ClusterNotFoundException occurs, THE Deployment System SHALL indicate the cluster name and suggest checking the region
5. IF a required input is missing, THEN THE Deployment System SHALL fail immediately with a clear message indicating which input is required

### Requirement 10

**User Story:** As a developer, I want the action to integrate seamlessly with existing AWS GitHub Actions, so that I can use it in my existing workflows without changes.

#### Acceptance Criteria

1. WHEN the action executes, THE Deployment System SHALL use AWS credentials configured by aws-actions/configure-aws-credentials
2. WHEN the action executes, THE Deployment System SHALL use the AWS region from environment variables set by configure-aws-credentials
3. WHEN the action executes, THE Deployment System SHALL NOT require separate AWS credential inputs
4. WHEN AWS credentials are not configured, THE Deployment System SHALL fail with a clear message directing users to use configure-aws-credentials
5. WHEN the action is used, THE Deployment System SHALL follow the same credential resolution order as other AWS GitHub Actions

### Requirement 11

**User Story:** As a developer, I want the action to follow GitHub Actions best practices, so that it integrates seamlessly with my workflows.

#### Acceptance Criteria

1. WHEN the action is defined, THE Deployment System SHALL provide an action.yml metadata file with all inputs and outputs documented
2. WHEN inputs are defined, THE Deployment System SHALL specify which inputs are required and which are optional with default values
3. WHEN the action executes, THE Deployment System SHALL use the GitHub Actions toolkit (@actions/core) for core functionality
4. WHEN the action completes, THE Deployment System SHALL call core.setFailed on errors to mark the action as failed
5. WHEN the action runs, THE Deployment System SHALL output progress information using core.info and core.debug logging
