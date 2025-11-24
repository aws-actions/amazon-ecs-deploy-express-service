const core = require('@actions/core');
const { ECSClient } = require('@aws-sdk/client-ecs');

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
    
  } catch (error) {
    core.setFailed(error.message);
    core.debug(error.stack);
  }
}

module.exports = run;

// Execute run() if this module is the entry point
if (require.main === module) {
  run();
}
