# Implementation Plan

- [x] 1. Set up project structure and initialize repository
  - Create feature branch `feature/express-service-deployment`
  - Initialize npm project with package.json
  - Add dependencies: @actions/core, @aws-sdk/client-ecs
  - Add devDependencies: @vercel/ncc, jest, eslint
  - Create .gitignore for node_modules and dist
  - _Requirements: 11.1, 11.2_

- [x] 2. Create action.yml metadata file
  - Define action name, description, and branding
  - Define all required inputs (image, execution-role-arn, infrastructure-role-arn)
  - Define all optional inputs with defaults (cluster, service, wait-for-service-stability, etc.)
  - Define outputs (service-arn, endpoint, status)
  - Specify runs configuration (node20, dist/index.js)
  - _Requirements: 11.1, 11.2_

- [ ] 3. Implement core action logic in index.js
  - [x] 3.1 Set up main run() function with try/catch
    - Create async run() function
    - Wrap in try/catch block
    - Call core.setFailed on errors
    - Export run function
    - Add module entry point check
    - _Requirements: 11.4_

  - [x] 3.2 Read and validate required inputs
    - Read image, execution-role-arn, infrastructure-role-arn using core.getInput
    - Validate required inputs are not empty
    - Fail with clear message if required inputs missing
    - _Requirements: 5.1, 5.2, 9.5_

  - [x] 3.3 Read optional inputs with defaults
    - Read service, cluster (default "default"), service-name
    - Read container configuration (port, environment, secrets, command)
    - Read resource configuration (cpu, memory)
    - Read networking configuration (subnets, security-groups)
    - Read scaling configuration (min/max task count, metric, target value)
    - Read wait-for-service-stability (default "true"), wait-for-minutes (default "30")
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 4.1, 4.2, 4.3, 6.1, 6.2, 7.1, 7.3_

  - [x] 3.4 Create AWS SDK client
    - Create ECS client with custom user agent
    - Use default credential provider chain from environment
    - _Requirements: 10.1, 10.2, 10.5_

  - [x] 3.5 Construct service ARN if service name provided
    - Get AWS region from ECS client config
    - Parse account ID from execution-role-arn (format: arn:aws:iam::ACCOUNT-ID:role/name)
    - Construct ARN: arn:aws:ecs:{region}:{account}:service/{cluster}/{service}
    - Handle missing cluster by using "default"
    - Note: Express Mode APIs require full ARN (unlike standard ECS UpdateService)
    - _Requirements: 1.1, 1.2_

  - [x] 3.6 Check if service exists
    - If service ARN constructed, call DescribeExpressGatewayServiceCommand
    - Catch ResourceNotFoundException to determine service doesn't exist
    - Set flag for create vs update
    - _Requirements: 1.3, 1.5_

  - [x] 3.7 Build SDK command input object
    - Create primaryContainer object with image
    - Add optional container fields (port, environment, secrets, command)
    - Add optional resource fields (cpu, memory)
    - Add optional IAM fields (taskRoleArn)
    - Add optional networking fields (networkConfiguration)
    - Add optional service fields (serviceName, cluster, healthCheckPath)
    - Add optional scaling fields (scalingTarget)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 4.1, 4.2, 4.3, 5.3, 6.1, 6.2, 7.1, 7.3_

  - [x] 3.8 Create or update service
    - If service exists, call UpdateExpressGatewayServiceCommand with serviceArn
    - If service doesn't exist, call CreateExpressGatewayServiceCommand
    - Handle AWS SDK errors (AccessDeniedException, InvalidParameterException, ClusterNotFoundException)
    - Log operation being performed
    - _Requirements: 1.4, 1.5, 9.1, 9.2, 9.3, 9.4_

  - [ ] 3.9 Wait for service stability
    - Check wait-for-service-stability input (default true)
    - If enabled, poll service using DescribeExpressGatewayServiceCommand
    - Check service status (ACTIVE, DRAINING, INACTIVE)
    - Poll every 15 seconds until ACTIVE or timeout
    - Respect wait-for-minutes timeout
    - Log progress during waiting
    - _Requirements: 11.5_

  - [ ] 3.10 Extract and set outputs
    - Extract service ARN from response
    - Extract endpoint URL from first ingress path if available
    - Extract status code from service status
    - Set outputs using core.setOutput
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [ ] 4. Add input validation and error handling
  - [ ] 4.1 Validate Fargate CPU/memory combinations
    - Check if provided CPU and memory form valid Fargate combination
    - Fail with clear message if invalid
    - _Requirements: 3.5_

  - [ ] 4.2 Validate scaling configuration
    - Check minTaskCount <= maxTaskCount
    - Fail with clear message if invalid
    - _Requirements: 4.5_

  - [ ] 4.3 Enhance AWS SDK error messages
    - Catch AccessDeniedException and add IAM guidance
    - Catch InvalidParameterException and indicate which parameter
    - Catch ClusterNotFoundException and suggest checking region
    - Include service name and cluster in error context
    - _Requirements: 9.2, 9.3, 9.4_

- [ ] 5. Write unit tests in index.test.js
  - [ ] 5.1 Set up Jest test environment
    - Create index.test.js
    - Mock @actions/core
    - Mock @aws-sdk/client-ecs
    - Add beforeEach to clear mocks
    - _Requirements: 11.3_

  - [ ] 5.2 Test required input validation
    - Test failure when image is missing
    - Test failure when execution-role-arn is missing
    - Test failure when infrastructure-role-arn is missing
    - Verify core.setFailed is called with appropriate message
    - _Requirements: 9.5_

  - [ ] 5.3 Test service ARN construction
    - Test ARN format with provided cluster
    - Test ARN format with default cluster
    - Test account ID is correctly parsed from execution-role-arn
    - Test ARN includes correct region and account ID
    - _Requirements: 1.1, 1.2_

  - [ ] 5.4 Test create vs update logic
    - Test update path when DescribeExpressGatewayServiceCommand succeeds
    - Test create path when DescribeExpressGatewayServiceCommand throws ResourceNotFoundException
    - Test create path when no service name provided
    - _Requirements: 1.3, 1.4, 1.5_

  - [ ] 5.5 Test SDK command input building
    - Test primaryContainer includes image
    - Test optional container fields are included when provided
    - Test optional fields are omitted when not provided
    - Test environment variables array structure
    - Test secrets array structure
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ] 5.6 Test resource configuration
    - Test CPU and memory are included as strings
    - Test CPU and memory are omitted when not provided
    - _Requirements: 3.1, 3.2_

  - [ ] 5.7 Test scaling configuration
    - Test scalingTarget includes min/max task counts
    - Test autoScalingMetric is included
    - Test autoScalingTargetValue is included
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ] 5.8 Test output extraction
    - Test service ARN is extracted and set as output
    - Test endpoint is extracted from ingress paths
    - Test status is extracted from service status
    - Verify core.setOutput is called correctly
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [ ] 5.9 Test error handling
    - Test AWS SDK errors are caught and logged
    - Test core.setFailed is called on errors
    - Test error messages include helpful context
    - _Requirements: 9.1, 11.4_

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Add build and packaging configuration
  - [ ] 7.1 Configure ncc build
    - Add package script: "ncc build index.js -o dist"
    - Add lint script: "eslint **.js"
    - Add test script: "eslint **.js && jest --coverage"
    - _Requirements: 11.3_

  - [ ] 7.2 Configure ESLint
    - Create eslint.config.mjs
    - Configure for Node.js environment
    - Match deploy-task-definition linting rules
    - _Requirements: 11.3_

  - [ ] 7.3 Build distributable
    - Run npm run package
    - Verify dist/index.js is created
    - Commit dist/index.js to repository
    - _Requirements: 11.1_

- [ ] 8. Create documentation
  - [ ] 8.1 Write comprehensive README.md
    - Add overview of Express Mode services
    - Document prerequisites (AWS credentials setup)
    - Add complete usage example with ECR login
    - Create input reference table
    - Create output reference table
    - Document required IAM permissions
    - Add comparison with deploy-task-definition
    - _Requirements: 11.1_

  - [ ] 8.2 Add LICENSE and CODE_OF_CONDUCT
    - Copy LICENSE from deploy-task-definition (MIT)
    - Copy CODE_OF_CONDUCT.md
    - Copy CONTRIBUTING.md
    - _Requirements: 11.1_

- [ ] 9. Set up CI/CD workflow
  - [ ] 9.1 Create .github/workflows/test.yml
    - Run on pull requests and pushes
    - Run npm install
    - Run npm test (lint + jest)
    - Run npm run package and verify dist is up to date
    - _Requirements: 11.3_

- [ ] 10. Final testing and validation
  - [ ] 10.1 Manual testing with real AWS account
    - Test creating a new Express service
    - Test updating an existing Express service
    - Test with various optional parameters
    - Test error scenarios
    - Verify outputs are correct
    - _Requirements: All_

  - [ ] 10.2 Create example workflows
    - Add examples/ directory
    - Create basic deployment example
    - Create example with all options
    - Create example with environment variables and secrets
    - _Requirements: 11.1_

- [ ] 11. Prepare for PR
  - Run final test suite
  - Verify all documentation is complete
  - Ensure dist/ is built and committed
  - Create PR from feature branch to main
  - _Requirements: All_
