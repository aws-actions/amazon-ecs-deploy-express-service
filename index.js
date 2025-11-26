const core = require('@actions/core');
const { 
  ECSClient, 
  DescribeServicesCommand,
  DescribeExpressGatewayServiceCommand,
  DescribeServiceDeploymentCommand,
  ListServiceDeploymentsCommand,
  CreateExpressGatewayServiceCommand,
  UpdateExpressGatewayServiceCommand
} = require('@aws-sdk/client-ecs');

/**
 * Main entry point for the GitHub Action
 * Creates or updates an Amazon ECS Express Mode service
 */
async function run() {
  try {
    core.info('Amazon ECS Deploy Express Service action started');
    
    // Read required inputs
    const serviceName = core.getInput('service-name', { required: false });
    const image = core.getInput('image', { required: false });
    const executionRoleArn = core.getInput('execution-role-arn', { required: false });
    const infrastructureRoleArn = core.getInput('infrastructure-role-arn', { required: false });
    
    // Validate required inputs are not empty
    if (!serviceName || serviceName.trim() === '') {
      throw new Error('Input required and not supplied: service-name');
    }
    
    if (!image || image.trim() === '') {
      throw new Error('Input required and not supplied: image');
    }
    
    if (!executionRoleArn || executionRoleArn.trim() === '') {
      throw new Error('Input required and not supplied: execution-role-arn');
    }
    
    if (!infrastructureRoleArn || infrastructureRoleArn.trim() === '') {
      throw new Error('Input required and not supplied: infrastructure-role-arn');
    }
    
    core.info(`Container image: ${image}`);
    core.debug(`Execution role ARN: ${executionRoleArn}`);
    core.debug(`Infrastructure role ARN: ${infrastructureRoleArn}`);
    
    // Create ECS client with custom user agent
    // Uses default credential provider chain from environment (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
    // Region is automatically detected from AWS_REGION or AWS_DEFAULT_REGION environment variables
    const ecs = new ECSClient({
      customUserAgent: 'amazon-ecs-deploy-express-service-for-github-actions'
    });
    
    core.debug('ECS client created successfully');
    
    // Read optional inputs for service identification
    const clusterName = core.getInput('cluster', { required: false }) || 'default';
    
    // Read optional container configuration inputs
    const containerPort = core.getInput('container-port', { required: false });
    const environmentVariables = core.getInput('environment-variables', { required: false });
    const secrets = core.getInput('secrets', { required: false });
    const command = core.getInput('command', { required: false });
    const logGroup = core.getInput('log-group', { required: false });
    const logStreamPrefix = core.getInput('log-stream-prefix', { required: false });
    const repositoryCredentials = core.getInput('repository-credentials', { required: false });
    
    // Read optional resource configuration inputs
    const cpu = core.getInput('cpu', { required: false });
    const memory = core.getInput('memory', { required: false });
    const taskRoleArn = core.getInput('task-role-arn', { required: false });
    
    // Read optional networking configuration inputs
    const subnets = core.getInput('subnets', { required: false });
    const securityGroups = core.getInput('security-groups', { required: false });
    
    // Read optional service configuration inputs
    const healthCheckPath = core.getInput('health-check-path', { required: false });
    
    // Read optional scaling configuration inputs
    const minTaskCount = core.getInput('min-task-count', { required: false });
    const maxTaskCount = core.getInput('max-task-count', { required: false });
    const autoScalingMetric = core.getInput('auto-scaling-metric', { required: false });
    const autoScalingTargetValue = core.getInput('auto-scaling-target-value', { required: false });
    
    // Get AWS region from ECS client config
    const region = await ecs.config.region();
    core.debug(`AWS Region: ${region}`);
    
    // Parse account ID from execution-role-arn
    // Format: arn:aws:iam::ACCOUNT-ID:role/name
    const arnParts = executionRoleArn.split(':');
    if (arnParts.length < 5) {
      throw new Error(`Invalid execution-role-arn format: ${executionRoleArn}`);
    }
    const accountId = arnParts[4];
    core.debug(`AWS Account ID: ${accountId}`);
    
    // Construct service ARN
    const serviceArn = `arn:aws:ecs:${region}:${accountId}:service/${clusterName}/${serviceName}`;
    core.info(`Constructed service ARN: ${serviceArn}`);
    
    // Check if service exists using DescribeServices
    let serviceExists = false;
    try {
      core.info('Checking if service exists...');
      const describeCommand = new DescribeServicesCommand({
        cluster: clusterName,
        services: [serviceName]
      });
      
      const describeResponse = await ecs.send(describeCommand);
      
      if (describeResponse.services && describeResponse.services.length > 0) {
        const service = describeResponse.services[0];
        if (service.status !== 'INACTIVE') {
          serviceExists = true;
          core.info(`Service exists with status: ${service.status}`);
        } else {
          core.info('Service exists but is INACTIVE, will create new service');
        }
      } else {
        core.info('Service does not exist, will create new service');
      }
    } catch (error) {
      if (error.name === 'ServiceNotFoundException' || error.name === 'ClusterNotFoundException') {
        core.info('Service or cluster not found, will create new service');
        serviceExists = false;
      } else {
        throw error;
      }
    }
    
    // Log the decision
    if (serviceExists) {
      core.info('Will UPDATE existing service');
    } else {
      core.info('Will CREATE new service');
    }
    
    // Build SDK command input object
    const serviceConfig = {
      executionRoleArn: executionRoleArn,
      infrastructureRoleArn: infrastructureRoleArn,
      primaryContainer: {
        image: image
      }
    };
    
    // Add optional container configuration
    if (containerPort && containerPort.trim() !== '') {
      serviceConfig.primaryContainer.containerPort = parseInt(containerPort, 10);
    }
    
    if (environmentVariables && environmentVariables.trim() !== '') {
      try {
        const envVars = JSON.parse(environmentVariables);
        serviceConfig.primaryContainer.environment = envVars;
      } catch (error) {
        throw new Error(`Invalid environment-variables JSON: ${error.message}`);
      }
    }
    
    if (secrets && secrets.trim() !== '') {
      try {
        const secretsArray = JSON.parse(secrets);
        serviceConfig.primaryContainer.secrets = secretsArray;
      } catch (error) {
        throw new Error(`Invalid secrets JSON: ${error.message}`);
      }
    }
    
    if (command && command.trim() !== '') {
      try {
        const commandArray = JSON.parse(command);
        serviceConfig.primaryContainer.command = commandArray;
      } catch (error) {
        throw new Error(`Invalid command JSON: ${error.message}`);
      }
    }
    
    // Add optional logging configuration
    if (logGroup && logGroup.trim() !== '' || logStreamPrefix && logStreamPrefix.trim() !== '') {
      serviceConfig.primaryContainer.awsLogsConfiguration = {};
      
      if (logGroup && logGroup.trim() !== '') {
        serviceConfig.primaryContainer.awsLogsConfiguration.logGroup = logGroup;
      }
      
      if (logStreamPrefix && logStreamPrefix.trim() !== '') {
        serviceConfig.primaryContainer.awsLogsConfiguration.logStreamPrefix = logStreamPrefix;
      }
    }
    
    // Add optional repository credentials
    if (repositoryCredentials && repositoryCredentials.trim() !== '') {
      serviceConfig.primaryContainer.repositoryCredentials = {
        credentialsParameter: repositoryCredentials
      };
    }
    
    // Add optional resource configuration
    if (cpu && cpu.trim() !== '') {
      serviceConfig.cpu = cpu;
    }
    
    if (memory && memory.trim() !== '') {
      serviceConfig.memory = memory;
    }
    
    if (taskRoleArn && taskRoleArn.trim() !== '') {
      serviceConfig.taskRoleArn = taskRoleArn;
    }
    
    // Add optional networking configuration
    if (subnets && subnets.trim() !== '') {
      const subnetArray = subnets.split(',').map(s => s.trim()).filter(s => s !== '');
      if (subnetArray.length > 0) {
        serviceConfig.networkConfiguration = {
          subnets: subnetArray
        };
        
        if (securityGroups && securityGroups.trim() !== '') {
          const sgArray = securityGroups.split(',').map(s => s.trim()).filter(s => s !== '');
          if (sgArray.length > 0) {
            serviceConfig.networkConfiguration.securityGroups = sgArray;
          }
        }
      }
    }
    
    // Add service configuration
    serviceConfig.serviceName = serviceName;
    
    if (clusterName && clusterName !== 'default') {
      serviceConfig.cluster = clusterName;
    }
    
    if (healthCheckPath && healthCheckPath.trim() !== '') {
      serviceConfig.healthCheckPath = healthCheckPath;
    }
    
    // Add optional scaling configuration
    const hasScalingConfig = (minTaskCount && minTaskCount.trim() !== '') ||
                             (maxTaskCount && maxTaskCount.trim() !== '') ||
                             (autoScalingMetric && autoScalingMetric.trim() !== '') ||
                             (autoScalingTargetValue && autoScalingTargetValue.trim() !== '');
    
    if (hasScalingConfig) {
      serviceConfig.scalingTarget = {};
      
      if (minTaskCount && minTaskCount.trim() !== '') {
        serviceConfig.scalingTarget.minTaskCount = parseInt(minTaskCount, 10);
      }
      
      if (maxTaskCount && maxTaskCount.trim() !== '') {
        serviceConfig.scalingTarget.maxTaskCount = parseInt(maxTaskCount, 10);
      }
      
      if (autoScalingMetric && autoScalingMetric.trim() !== '') {
        serviceConfig.scalingTarget.autoScalingMetric = autoScalingMetric;
      }
      
      if (autoScalingTargetValue && autoScalingTargetValue.trim() !== '') {
        serviceConfig.scalingTarget.autoScalingTargetValue = parseFloat(autoScalingTargetValue);
      }
    }
    
    // Create or update the service
    let response;
    try {
      if (serviceExists && serviceArn) {
        // Update existing service
        core.info('Updating Express Gateway service...');
        const updateCommand = new UpdateExpressGatewayServiceCommand({
          serviceArn: serviceArn,
          ...serviceConfig
        });
        response = await ecs.send(updateCommand);
        core.info('Service updated successfully');
      } else {
        // Create new service
        core.info('Creating Express Gateway service...');
        const createCommand = new CreateExpressGatewayServiceCommand(serviceConfig);
        response = await ecs.send(createCommand);
        core.info('Service created successfully');
      }
    } catch (error) {
      // Handle AWS SDK errors with helpful messages
      if (error.name === 'AccessDeniedException') {
        throw new Error(`Access denied: ${error.message}. Please check that the IAM roles have the necessary permissions for ECS Express Mode operations.`);
      } else if (error.name === 'InvalidParameterException') {
        throw new Error(`Invalid parameter: ${error.message}. Please check your input values.`);
      } else if (error.name === 'ClusterNotFoundException') {
        throw new Error(`Cluster not found: ${clusterName}. Please check the cluster name and region.`);
      } else {
        throw error;
      }
    }
    
    core.debug(`Service response: ${JSON.stringify(response, null, 2)}`);
    
    // Get the service ARN from response
    const finalServiceArn = response?.service?.serviceArn || serviceArn;
    
    // Set service ARN output
    if (finalServiceArn) {
      core.setOutput('service-arn', finalServiceArn);
      core.info(`Service ARN: ${finalServiceArn}`);
    }
    
    // Wait for deployment to complete
    await waitForServiceStable(ecs, finalServiceArn);
    
  } catch (error) {
    core.setFailed(error.message);
    core.debug(error.stack);
  }
}

/**
 * Wait for Express Gateway service to reach stable state
 * Following CloudFormation's approach:
 * 1. Describe service to get current status
 * 2. List service deployments to get deployment ARNs (avoids DB consistency issues)
 * 3. Wait for service status to become ACTIVE
 * 4. Wait for deployment status to become SUCCESSFUL
 */
async function waitForServiceStable(ecs, serviceArn) {
  core.info('Waiting for service deployment to complete...');
  const maxWaitMinutes = 15;
  const pollIntervalSeconds = 15;
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  const startTime = Date.now();
  
  let serviceActive = false;
  let deploymentArn = null;
  
  while (true) {
    // Check timeout
    if (Date.now() - startTime > maxWaitMs) {
      core.warning(`Deployment is taking longer than ${maxWaitMinutes} minutes. The deployment will continue in the background.`);
      break;
    }
    
    try {
      // Step 1: Check service status using DescribeExpressGatewayService
      const describeServiceCommand = new DescribeExpressGatewayServiceCommand({
        serviceArn: serviceArn
      });
      const serviceResponse = await ecs.send(describeServiceCommand);
      
      if (serviceResponse.service) {
        const service = serviceResponse.service;
        const statusCode = service.status?.statusCode;
        
        // Check for failure states
        if (statusCode === 'INACTIVE' || statusCode === 'DRAINING') {
          throw new Error(`Service entered ${statusCode} state`);
        }
        
        // Check if service is ACTIVE
        if (statusCode === 'ACTIVE') {
          if (!serviceActive) {
            serviceActive = true;
          }
          
          // Step 2: List service deployments to get deployment ARNs
          // This follows CloudFormation's pattern to avoid DB consistency issues
          if (!deploymentArn) {
            try {
              const listDeploymentsCommand = new ListServiceDeploymentsCommand({
                serviceArn: serviceArn
              });
              const listResponse = await ecs.send(listDeploymentsCommand);
              
              if (listResponse.serviceDeployments && listResponse.serviceDeployments.length > 0) {
                // Get the most recent deployment (first in the list)
                deploymentArn = listResponse.serviceDeployments[0];
                core.info(`Monitoring deployment: ${deploymentArn}`);
              }
            } catch (listError) {
              core.debug(`ListServiceDeployments error: ${listError.message}`);
            }
          }
          
          // Step 3: Check deployment status using DescribeServiceDeployment
          if (deploymentArn) {
            const describeDeploymentCommand = new DescribeServiceDeploymentCommand({
              serviceDeploymentArn: deploymentArn
            });
            const deploymentResponse = await ecs.send(describeDeploymentCommand);
            
            if (deploymentResponse.serviceDeployment) {
              const deployment = deploymentResponse.serviceDeployment;
              const deploymentStatus = deployment.status?.statusCode;
              
              core.info(`Deployment ${deploymentArn} status: ${deploymentStatus}. Will re-poll in ${pollIntervalSeconds} seconds...`);
              
              // Check for deployment failure
              if (deploymentStatus === 'FAILED' || deploymentStatus === 'STOPPED') {
                throw new Error(`Deployment ${deploymentArn} ${deploymentStatus}`);
              }
              
              // Deployment is complete when status is SUCCESSFUL
              if (deploymentStatus === 'SUCCESSFUL') {
                core.info('Deployment completed successfully');
                
                // Extract endpoint from active configurations
                if (service.activeConfigurations && 
                    service.activeConfigurations.length > 0 &&
                    service.activeConfigurations[0].ingressPaths &&
                    service.activeConfigurations[0].ingressPaths.length > 0) {
                  const endpoint = service.activeConfigurations[0].ingressPaths[0].endpoint;
                  if (endpoint) {
                    core.setOutput('endpoint', endpoint);
                    core.info(`Service endpoint: ${endpoint}`);
                  }
                }
                return;
              }
            }
          }
        }
      }
    } catch (error) {
      // Only warn on transient errors, throw on actual failures
      if (error.message.includes('entered') || error.message.includes('FAILED') || error.message.includes('STOPPED')) {
        throw error;
      }
      core.warning(`Error checking status: ${error.message}`);
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollIntervalSeconds * 1000));
  }
}

module.exports = run;

// Execute run() if this module is the entry point
if (require.main === module) {
  run();
}
