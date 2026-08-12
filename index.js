// GitHub Action for deploying ECS Express services
// Trigger deployment test
const core = require('@actions/core');
const { 
  ECSClient, 
  DescribeServicesCommand,
  DescribeExpressGatewayServiceCommand,
  DescribeServiceDeploymentsCommand,
  ListServiceDeploymentsCommand,
  CreateExpressGatewayServiceCommand,
  UpdateExpressGatewayServiceCommand,
  TagResourceCommand,
  UntagResourceCommand
} = require('@aws-sdk/client-ecs');

// Service deployment statuses that mean the deployment will not succeed. A rollback
// (whether it succeeds or fails) means the new revision never became healthy, so both
// ROLLBACK_* terminal states are failures. Note ServiceDeploymentStatus has no 'FAILED'
// value, so the previous check for it never matched.
const TERMINAL_FAILURE_STATUSES = new Set([
  'ROLLBACK_SUCCESSFUL',
  'ROLLBACK_FAILED',
  'STOPPED'
]);

/**
 * Parse tags from JSON format input
 * Expected format: [{"key":"Environment","value":"Production"}]
 * @param {string} tagsInput - JSON string containing tag array
 * @returns {Array} Array of tag objects with key and value properties
 */
function parseTagsFromJSON(tagsInput) {
  if (!tagsInput || tagsInput.trim() === '') {
    return [];
  }
  
  try {
    const tags = JSON.parse(tagsInput);
    if (!Array.isArray(tags)) {
      throw new Error('Tags must be an array');
    }
    return tags;
  } catch (error) {
    throw new Error(`Invalid tags JSON: ${error.message}`);
  }
}

/**
 * Parse tags from multiline format input
 * Expected format: key=value (one per line)
 * @param {string} tagsInput - Multiline string with key=value pairs
 * @returns {Array} Array of tag objects with key and value properties
 */
function parseTagsFromMultiline(tagsInput) {
  if (!tagsInput || tagsInput.trim() === '') {
    return [];
  }
  
  const tags = [];
  const lines = tagsInput.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') {
      continue; // Skip empty lines
    }
    
    const equalIndex = trimmedLine.indexOf('=');
    if (equalIndex === -1) {
      throw new Error(`Invalid tag format: "${trimmedLine}". Expected format: key=value`);
    }
    
    const key = trimmedLine.substring(0, equalIndex).trim();
    const value = trimmedLine.substring(equalIndex + 1).trim();
    
    if (key === '') {
      throw new Error(`Empty tag key in line: "${trimmedLine}"`);
    }
    
    tags.push({ key, value });
  }
  
  return tags;
}


/**
 * Handle complete tag state management for an existing ECS service during updates
 * Implements set difference logic:
 * - tagsToRemove = previousTags - desiredTags
 * - tagsToAdd = desiredTags - previousTags
 * @param {ECSClient} ecs - The ECS client
 * @param {string} serviceArn - The ARN of the service to manage tags for
 * @param {Array} previousTags - Array of current tag objects on the service
 * @param {Array} desiredTags - Array of desired tag objects from input
 */
async function handleTagsOnUpdate(ecs, serviceArn, previousTags, desiredTags) {
  // Normalize inputs
  const currentTags = previousTags || [];
  const newTags = desiredTags || [];
  
  // Create maps for efficient comparison (key -> {key, value})
  const currentTagMap = new Map(currentTags.map(tag => [tag.key, tag]));
  const desiredTagMap = new Map(newTags.map(tag => [tag.key, tag]));
  
  // Calculate set differences
  // tagsToRemove = previousTags - desiredTags (tags that exist currently but not in desired)
  const tagsToRemove = currentTags.filter(tag => !desiredTagMap.has(tag.key));
  
  // tagsToAdd = desiredTags - previousTags (tags that are desired but don't exist or have different values)
  const tagsToAdd = newTags.filter(tag => {
    const currentTag = currentTagMap.get(tag.key);
    return !currentTag || currentTag.value !== tag.value;
  });
  
  core.debug(`Tag management: ${tagsToRemove.length} to remove, ${tagsToAdd.length} to add`);
  
  // Remove obsolete tags first
  if (tagsToRemove.length > 0) {
    core.debug(`Removing ${tagsToRemove.length} obsolete tags from service: ${serviceArn}`);
    
    // UntagResource expects an array of tag keys (strings), not tag objects
    const tagKeysToRemove = tagsToRemove.map(tag => tag.key);
    
    const untagResourceCommand = new UntagResourceCommand({
      resourceArn: serviceArn,
      tagKeys: tagKeysToRemove
    });
    
    try {
      await ecs.send(untagResourceCommand);
      core.info(`Successfully removed ${tagsToRemove.length} obsolete tags from service`);
    } catch (error) {
      core.error(`Failed to remove obsolete tags from service: ${error.message}`);
      core.debug(`UntagResource error details: ${JSON.stringify(error, null, 2)}`);
      throw new Error(`Tag removal failed: ${error.message}`);
    }
  }
  
  // Add new/updated tags
  if (tagsToAdd.length > 0) {
    core.debug(`Adding ${tagsToAdd.length} tags to existing service: ${serviceArn}`);
    
    const tagResourceCommand = new TagResourceCommand({
      resourceArn: serviceArn,
      tags: tagsToAdd
    });
    
    try {
      await ecs.send(tagResourceCommand);
      core.info(`Successfully applied ${tagsToAdd.length} tags to existing service`);
    } catch (error) {
      core.error(`Failed to apply tags to existing service: ${error.message}`);
      core.debug(`TagResource error details: ${JSON.stringify(error, null, 2)}`);
      throw new Error(`Tag application failed: ${error.message}`);
    }
  }
  
  if (tagsToRemove.length === 0 && tagsToAdd.length === 0) {
    core.debug('No tag changes needed - current tags match desired tags');
  }
}

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
    const taskDefinitionArn = core.getInput('task-definition-arn', { required: false });

    // When a task definition ARN is provided, the task definition manages the container
    // and task-level settings, so the container-related inputs are not allowed
    const isTaskDefinitionMode = !!(taskDefinitionArn && taskDefinitionArn.trim() !== '');

    // Validate required inputs are not empty
    if (!serviceName || serviceName.trim() === '') {
      throw new Error('Input required and not supplied: service-name');
    }

    if (!isTaskDefinitionMode) {
      if (!image || image.trim() === '') {
        throw new Error('Input required and not supplied: image');
      }

      if (!executionRoleArn || executionRoleArn.trim() === '') {
        throw new Error('Input required and not supplied: execution-role-arn');
      }
    }

    if (!infrastructureRoleArn || infrastructureRoleArn.trim() === '') {
      throw new Error('Input required and not supplied: infrastructure-role-arn');
    }

    if (isTaskDefinitionMode) {
      core.info(`Task definition: ${taskDefinitionArn}`);
    } else {
      core.info(`Container image: ${image}`);
      core.debug(`Execution role ARN: ${executionRoleArn}`);
    }
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
    const tags = core.getInput('tags', { required: false });
    const enableTagManagement = core.getInput('mutate-tags-on-update', { required: false });
    
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

    // The ECS API rejects requests that combine taskDefinitionArn with primaryContainer,
    // executionRoleArn, taskRoleArn, cpu, or memory; fail fast with a clear message instead
    if (isTaskDefinitionMode) {
      const conflictingInputs = [
        ['image', image],
        ['execution-role-arn', executionRoleArn],
        ['task-role-arn', taskRoleArn],
        ['cpu', cpu],
        ['memory', memory],
        ['container-port', containerPort],
        ['environment-variables', environmentVariables],
        ['secrets', secrets],
        ['command', command],
        ['log-group', logGroup],
        ['log-stream-prefix', logStreamPrefix],
        ['repository-credentials', repositoryCredentials]
      ].filter(([, value]) => value && value.trim() !== '').map(([name]) => name);

      if (conflictingInputs.length > 0) {
        throw new Error(`The following inputs cannot be used with task-definition-arn: ${conflictingInputs.join(', ')}. These settings must be defined in the task definition instead.`);
      }
    }

    // Get AWS region from ECS client config
    const region = await ecs.config.region();
    core.debug(`AWS Region: ${region}`);

    // Parse account ID from an IAM role ARN
    // Format: arn:aws:iam::ACCOUNT-ID:role/name
    // execution-role-arn is not allowed in task definition mode, so fall back to
    // infrastructure-role-arn (required in both modes) there
    const accountIdSourceName = isTaskDefinitionMode ? 'infrastructure-role-arn' : 'execution-role-arn';
    const accountIdSourceArn = isTaskDefinitionMode ? infrastructureRoleArn : executionRoleArn;
    const arnParts = accountIdSourceArn.split(':');
    if (arnParts.length < 5) {
      throw new Error(`Invalid ${accountIdSourceName} format: ${accountIdSourceArn}`);
    }
    const accountId = arnParts[4];
    core.debug(`AWS Account ID: ${accountId}`);
    
    // Construct service ARN
    const serviceArn = `arn:aws:ecs:${region}:${accountId}:service/${clusterName}/${serviceName}`;
    core.info(`Constructed service ARN: ${serviceArn}`);
    
    // Check if service exists using DescribeServices and capture current tags
    let serviceExists = false;
    let currentServiceTags = [];
    try {
      core.info('Checking if service exists...');
      const describeCommand = new DescribeServicesCommand({
        cluster: clusterName,
        services: [serviceName],
        include: ['TAGS']
      });
      
      const describeResponse = await ecs.send(describeCommand);
      
      if (describeResponse.services && describeResponse.services.length > 0) {
        const service = describeResponse.services[0];
        if (service.status !== 'INACTIVE') {
          serviceExists = true;
          currentServiceTags = service.tags || [];
          core.info(`Service exists with status: ${service.status}`);
          core.debug(`Current service has ${currentServiceTags.length} tags`);
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
    // In task definition mode the task definition supplies the container, roles, cpu,
    // and memory settings; the conflicting inputs were rejected above, so the optional
    // blocks below are no-ops in that mode
    const serviceConfig = isTaskDefinitionMode
      ? {
          taskDefinitionArn: taskDefinitionArn,
          infrastructureRoleArn: infrastructureRoleArn
        }
      : {
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
    
    // Process tags input
    if (tags && tags.trim() !== '') {
      try {
        let parsedTags;
        
        // Try to parse as JSON first
        if (tags.trim().startsWith('[')) {
          parsedTags = parseTagsFromJSON(tags);
        } else {
          // Parse as multiline format
          parsedTags = parseTagsFromMultiline(tags);
        }
        
        if (parsedTags.length > 0) {
          serviceConfig.tags = parsedTags;
        }
      } catch (error) {
        const errorMessage = `Tag parsing failed: ${error.message}`;
        core.setFailed(errorMessage);
        throw new Error(errorMessage);
      }
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
    let deploymentStartTime;
    try {
      if (serviceExists && serviceArn) {
        // Update existing service
        core.info('Updating Express Gateway service...');
        // Capture timestamp right before making the API call
        deploymentStartTime = new Date();
        const updateCommand = new UpdateExpressGatewayServiceCommand({
          serviceArn: serviceArn,
          ...serviceConfig
        });
        // Handle tags for existing service before update
        // Note: UpdateExpressGatewayServiceCommand doesn't support tags parameter
        if (enableTagManagement && enableTagManagement.toLowerCase() === 'true') {
          const desiredTags = serviceConfig.tags || [];
          await handleTagsOnUpdate(ecs, serviceArn, currentServiceTags, desiredTags);
        }
        
        response = await ecs.send(updateCommand);
        core.info('Service updated successfully');
      } else {
        // Create new service
        core.info('Creating Express Gateway service...');
        // Capture timestamp right before making the API call
        deploymentStartTime = new Date();
        const createCommand = new CreateExpressGatewayServiceCommand(serviceConfig);
        response = await ecs.send(createCommand);
        core.info('Service created successfully');
        
        // Log successful tag application for service creation
        // Note: Tags are only applied during service creation, not during updates
        if (serviceConfig.tags && serviceConfig.tags.length > 0) {
          core.debug(`Tags successfully included in service creation`);
        }
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
    await waitForServiceStable(ecs, finalServiceArn, deploymentStartTime);
    
  } catch (error) {
    core.setFailed(error.message);
    core.debug(error.stack);
  }
}

/**
 * Wait for Express Gateway service to reach stable state
 * 1. Describe service to get current status
 * 2. List service deployments to get deployment ARNs (avoids DB consistency issues)
 * 3. Wait for service status to become ACTIVE
 * 4. Wait for deployment status to become SUCCESSFUL
 * 
 * @param {ECSClient} ecs - The ECS client
 * @param {string} serviceArn - The service ARN
 * @param {Date} deploymentStartTime - Timestamp when the deployment was initiated
 */
async function waitForServiceStable(ecs, serviceArn, deploymentStartTime) {
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
        
        // Log the actual service ARN from the response for debugging
        if (service.serviceArn && service.serviceArn !== serviceArn) {
          core.debug(`Service ARN from response: ${service.serviceArn}`);
        }
        
        // Check for failure states
        if (statusCode === 'INACTIVE' || statusCode === 'DRAINING') {
          const failure = new Error(`Service entered ${statusCode} state`);
          failure.isTerminalFailure = true;
          throw failure;
        }
        
        // Check if service is ACTIVE
        if (statusCode === 'ACTIVE') {
          if (!serviceActive) {
            serviceActive = true;
          }
          
          // Step 2: List service deployments to get deployment ARNs
          // This follows CloudFormation's pattern to avoid DB consistency issues
          // Filter for deployments created after our action initiated the deployment
          if (!deploymentArn) {
            try {
              core.debug(`Calling ListServiceDeployments with service ARN: ${serviceArn}, filtering for deployments after ${deploymentStartTime.toISOString()}`);
              const listDeploymentsCommand = new ListServiceDeploymentsCommand({
                cluster: service.cluster || 'default',
                service: serviceArn,
                createdAt: {
                  after: deploymentStartTime
                }
              });
              const listResponse = await ecs.send(listDeploymentsCommand);
              
              // Log the full response for debugging
              core.debug(`ListServiceDeployments response: ${JSON.stringify(listResponse, null, 2)}`);
              
              const deploymentCount = listResponse.serviceDeployments?.length || 0;
              core.info(`Found ${deploymentCount} deployment(s) created after ${deploymentStartTime.toISOString()}`);
              
              if (listResponse.serviceDeployments && listResponse.serviceDeployments.length > 0) {
                // Get the most recent deployment (first in the list)
                const deployment = listResponse.serviceDeployments[0];
                deploymentArn = deployment.serviceDeploymentArn;
                core.info(`Monitoring deployment: ${deploymentArn}`);
              } else {
                core.debug('No deployments found yet, will retry...');
              }
            } catch (listError) {
              core.warning(`ListServiceDeployments error: ${listError.message}. Service ARN: ${serviceArn}`);
            }
          }
          
          // Step 3: Check deployment status using DescribeServiceDeployments
          if (deploymentArn) {
            const describeDeploymentCommand = new DescribeServiceDeploymentsCommand({
              serviceDeploymentArns: [deploymentArn]
            });
            const deploymentResponse = await ecs.send(describeDeploymentCommand);
            
            if (deploymentResponse.serviceDeployments && deploymentResponse.serviceDeployments.length > 0) {
              const deployment = deploymentResponse.serviceDeployments[0];
              const deploymentStatus = deployment.status;
              
              core.info(`Deployment ${deploymentArn} status: ${deploymentStatus}. Will re-poll in ${pollIntervalSeconds} seconds...`);

              // Check for terminal failure states. A rollback (successful or failed) means
              // the new revision did not become healthy, so both are deployment failures.
              // ServiceDeploymentStatus has no 'FAILED' value; the real terminal failures
              // are ROLLBACK_SUCCESSFUL, ROLLBACK_FAILED, and STOPPED.
              if (TERMINAL_FAILURE_STATUSES.has(deploymentStatus)) {
                const diagnostics = [
                  deployment.statusReason && `Status reason: ${deployment.statusReason}`,
                  deployment.rollback?.reason && `Rollback reason: ${deployment.rollback.reason}`
                ].filter(Boolean);
                const failure = new Error(
                  `Deployment ${deploymentArn} ${deploymentStatus}${diagnostics.length > 0 ? `: ${diagnostics.join('; ')}` : ''}`
                );
                failure.isTerminalFailure = true;
                throw failure;
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
      // Re-throw terminal failures; only warn and keep polling on transient errors
      if (error.isTerminalFailure) {
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
