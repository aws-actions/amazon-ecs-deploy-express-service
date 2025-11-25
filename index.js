const core = require('@actions/core');
const { 
  ECSClient, 
  DescribeClustersCommand,
  DescribeServicesCommand,
  CreateExpressGatewayServiceCommand,
  UpdateExpressGatewayServiceCommand,
  DescribeExpressGatewayServiceCommand,
  ListServiceDeploymentsCommand,
  DescribeServiceDeploymentsCommand
} = require('@aws-sdk/client-ecs');

/**
 * Main entry point for the GitHub Action
 * Creates or updates an Amazon ECS Express Mode service
 */
async function run() {
  try {
    core.info('Amazon ECS Deploy Express Service action started');
    
    // Read required inputs
    const image = core.getInput('image', { required: false });
    const executionRoleArn = core.getInput('execution-role-arn', { required: false });
    const infrastructureRoleArn = core.getInput('infrastructure-role-arn', { required: false });
    
    // Validate required inputs are not empty
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
    const serviceName = core.getInput('service', { required: false });
    const clusterName = core.getInput('cluster', { required: false }) || 'default';
    
    // Read optional container configuration inputs
    const containerPort = core.getInput('container-port', { required: false });
    const environmentVariables = core.getInput('environment-variables', { required: false });
    const secrets = core.getInput('secrets', { required: false });
    const command = core.getInput('command', { required: false });
    
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
    
    // Always check if cluster exists
    core.info(`Checking if cluster '${clusterName}' exists...`);
    let clusterExists = false;
    try {
      const describeClustersCommand = new DescribeClustersCommand({
        clusters: [clusterName]
      });
      const clusterResponse = await ecs.send(describeClustersCommand);
      
      if (!clusterResponse.clusters || clusterResponse.clusters.length === 0) {
        // Cluster not found
        if (clusterName === 'default') {
          core.info(`Default cluster not found, will be created with the service`);
          clusterExists = false;
        } else {
          throw new Error(`Cluster '${clusterName}' not found in region ${region}. Please create the cluster first or use the default cluster.`);
        }
      } else {
        const cluster = clusterResponse.clusters[0];
        if (cluster.status !== 'ACTIVE') {
          if (clusterName === 'default') {
            core.info(`Default cluster exists but is not ACTIVE (status: ${cluster.status}), will proceed with creation`);
            clusterExists = false;
          } else {
            throw new Error(`Cluster '${clusterName}' exists but is not ACTIVE (status: ${cluster.status}). Please check the cluster status.`);
          }
        } else {
          core.info(`Cluster '${clusterName}' is ACTIVE`);
          clusterExists = true;
        }
      }
    } catch (error) {
      if (error.name === 'ClusterNotFoundException') {
        if (clusterName === 'default') {
          core.info(`Default cluster not found, will be created with the service`);
          clusterExists = false;
        } else {
          throw new Error(`Cluster '${clusterName}' not found in region ${region}. Please create the cluster first or use the default cluster.`);
        }
      } else {
        throw error;
      }
    }
    
    // Construct service ARN if service name is provided
    let serviceArn = null;
    let serviceExists = false;
    
    if (serviceName && serviceName.trim() !== '') {
      // Construct service ARN: arn:aws:ecs:{region}:{account}:service/{cluster}/{service}
      serviceArn = `arn:aws:ecs:${region}:${accountId}:service/${clusterName}/${serviceName}`;
      core.info(`Constructed service ARN: ${serviceArn}`);
      
      // Only check if service exists if cluster exists
      if (clusterExists) {
        // Check if service exists using DescribeServices
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
          if (error.name === 'ServiceNotFoundException') {
            core.info('Service not found, will create new service');
            serviceExists = false;
          } else {
            throw error;
          }
        }
      } else {
        core.info('Cluster does not exist, skipping service existence check - will create both');
      }
    } else {
      core.info('No service name provided, will create a new service with AWS-generated name');
    }
    
    // Log the decision
    if (serviceArn) {
      if (serviceExists) {
        core.info('Will UPDATE existing service');
      } else {
        core.info('Will CREATE new service');
      }
    } else {
      core.info('Will CREATE new service with AWS-generated name');
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
    
    // Add optional service configuration
    if (serviceName && serviceName.trim() !== '') {
      serviceConfig.serviceName = serviceName;
    }
    
    if (clusterName && clusterName !== 'default') {
      serviceConfig.cluster = clusterName;
    }
    
    if (healthCheckPath && healthCheckPath.trim() !== '') {
      serviceConfig.healthCheckPath = healthCheckPath;
    }
    
    // Add optional scaling configuration
    if (minTaskCount && minTaskCount.trim() !== '' && maxTaskCount && maxTaskCount.trim() !== '') {
      serviceConfig.scalingTarget = {
        minTaskCount: parseInt(minTaskCount, 10),
        maxTaskCount: parseInt(maxTaskCount, 10)
      };
      
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
    
    // Extract service ARN from response
    const finalServiceArn = response.service?.serviceArn || serviceArn;
    
    // Wait for service stability if requested
    const waitForStability = core.getInput('wait-for-service-stability', { required: false }) !== 'false';
    const waitMinutes = parseInt(core.getInput('wait-for-minutes', { required: false }) || '30', 10);
    
    if (waitForStability && finalServiceArn) {
      core.info('Waiting for service to reach stable state...');
      const operationTime = new Date();
      const timeoutMs = waitMinutes * 60 * 1000;
      const startTime = Date.now();
      
      await waitForServiceStable(ecs, finalServiceArn, clusterName, serviceName, operationTime, timeoutMs, startTime);
      
      core.info('Service has reached stable state');
    }
    
    // Set outputs
    if (finalServiceArn) {
      core.setOutput('service-arn', finalServiceArn);
    }
    
    // Get final service state for outputs
    if (finalServiceArn) {
      try {
        const describeCommand = new DescribeExpressGatewayServiceCommand({
          serviceArn: finalServiceArn
        });
        const finalService = await ecs.send(describeCommand);
        
        if (finalService.service) {
          // Extract endpoint from ingress paths
          if (finalService.service.activeConfigurations && 
              finalService.service.activeConfigurations.length > 0 &&
              finalService.service.activeConfigurations[0].ingressPaths &&
              finalService.service.activeConfigurations[0].ingressPaths.length > 0) {
            const endpoint = finalService.service.activeConfigurations[0].ingressPaths[0].endpoint;
            if (endpoint) {
              core.setOutput('endpoint', endpoint);
            }
          }
          
          // Extract status
          if (finalService.service.status && finalService.service.status.statusCode) {
            core.setOutput('status', finalService.service.status.statusCode);
          }
        }
      } catch (error) {
        core.warning(`Could not retrieve final service state for outputs: ${error.message}`);
      }
    }
    
  } catch (error) {
    core.setFailed(error.message);
    core.debug(error.stack);
  }
}

/**
 * Wait for Express Gateway service to reach stable state
 * Follows Terraform's approach: wait for service ACTIVE, then wait for deployment to complete
 */
async function waitForServiceStable(ecs, serviceArn, clusterName, serviceName, operationTime, timeoutMs, startTime) {
  const pollInterval = 15000; // 15 seconds
  
  while (true) {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for service stability after ${timeoutMs / 60000} minutes`);
    }
    
    // Describe the service
    const describeCommand = new DescribeExpressGatewayServiceCommand({
      serviceArn: serviceArn
    });
    const serviceResponse = await ecs.send(describeCommand);
    
    if (!serviceResponse.service) {
      throw new Error('Service not found during stability wait');
    }
    
    const service = serviceResponse.service;
    const statusCode = service.status?.statusCode;
    
    core.info(`Service status: ${statusCode}`);
    
    // Check if service is INACTIVE or DRAINING (failure states)
    if (statusCode === 'INACTIVE' || statusCode === 'DRAINING') {
      throw new Error(`Service entered ${statusCode} state`);
    }
    
    // If service is not ACTIVE yet, keep waiting
    if (statusCode !== 'ACTIVE') {
      core.info(`Waiting for service to become ACTIVE (current: ${statusCode})...`);
      await sleep(pollInterval);
      continue;
    }
    
    // Service is ACTIVE, now check deployment status
    const currentDeployment = service.currentDeployment;
    
    if (!currentDeployment) {
      core.info('No current deployment found, service is stable');
      return;
    }
    
    // List deployments created after operation time
    const listDeploymentsCommand = new ListServiceDeploymentsCommand({
      cluster: clusterName,
      service: serviceName,
      createdAt: {
        after: operationTime
      }
    });
    
    const deploymentsResponse = await ecs.send(listDeploymentsCommand);
    
    if (!deploymentsResponse.serviceDeployments || deploymentsResponse.serviceDeployments.length === 0) {
      core.info('No recent deployments found, checking current deployment...');
      // Fall back to checking current deployment
      const deploymentStatus = await getDeploymentStatus(ecs, currentDeployment);
      
      if (deploymentStatus === 'SUCCESSFUL') {
        core.info('Current deployment is successful, service is stable');
        return;
      }
      
      if (deploymentStatus === 'FAILED' || deploymentStatus === 'STOPPED') {
        throw new Error(`Deployment ${currentDeployment} ${deploymentStatus}`);
      }
      
      core.info(`Deployment status: ${deploymentStatus}, waiting...`);
      await sleep(pollInterval);
      continue;
    }
    
    // Check the most recent deployment
    const latestDeployment = deploymentsResponse.serviceDeployments[0];
    const deploymentArn = latestDeployment.serviceDeploymentArn;
    
    const deploymentStatus = await getDeploymentStatus(ecs, deploymentArn);
    
    core.info(`Deployment ${deploymentArn} status: ${deploymentStatus}`);
    
    if (deploymentStatus === 'SUCCESSFUL') {
      core.info('Deployment completed successfully, service is stable');
      return;
    }
    
    if (deploymentStatus === 'FAILED' || deploymentStatus === 'STOPPED') {
      throw new Error(`Deployment ${deploymentArn} ${deploymentStatus}`);
    }
    
    // Deployment still in progress
    core.info(`Deployment in progress (${deploymentStatus}), waiting...`);
    await sleep(pollInterval);
  }
}

/**
 * Get deployment status
 */
async function getDeploymentStatus(ecs, deploymentArn) {
  try {
    const describeDeploymentCommand = new DescribeServiceDeploymentsCommand({
      serviceDeploymentArns: [deploymentArn]
    });
    
    const deploymentResponse = await ecs.send(describeDeploymentCommand);
    
    if (deploymentResponse.serviceDeployments && deploymentResponse.serviceDeployments.length > 0) {
      const deployment = deploymentResponse.serviceDeployments[0];
      return deployment.status || 'UNKNOWN';
    }
    
    return 'UNKNOWN';
  } catch (error) {
    core.warning(`Could not get deployment status: ${error.message}`);
    return 'UNKNOWN';
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = run;

// Execute run() if this module is the entry point
if (require.main === module) {
  run();
}
