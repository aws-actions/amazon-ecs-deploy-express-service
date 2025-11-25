const core = require('@actions/core');
const { ECSClient } = require('@aws-sdk/client-ecs');
const run = require('./index');

// Mock the dependencies
jest.mock('@actions/core');
jest.mock('@aws-sdk/client-ecs');

describe('Amazon ECS Deploy Express Service Action', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock implementations
    core.getInput = jest.fn();
    core.setFailed = jest.fn();
    core.setOutput = jest.fn();
    core.info = jest.fn();
    core.debug = jest.fn();
  });

  describe('Input Validation', () => {
    test('should fail when image input is missing', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/execution';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/infrastructure';
        return '';
      });

      await run();

      expect(core.setFailed).toHaveBeenCalledWith('Input required and not supplied: image');
    });

    test('should fail when execution-role-arn input is missing', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return 'nginx:latest';
        if (name === 'execution-role-arn') return '';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/infrastructure';
        return '';
      });

      await run();

      expect(core.setFailed).toHaveBeenCalledWith('Input required and not supplied: execution-role-arn');
    });

    test('should fail when infrastructure-role-arn input is missing', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return 'nginx:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/execution';
        if (name === 'infrastructure-role-arn') return '';
        return '';
      });

      await run();

      expect(core.setFailed).toHaveBeenCalledWith('Input required and not supplied: infrastructure-role-arn');
    });

    test('should accept valid required inputs', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return 'nginx:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/execution';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/infrastructure';
        if (name === 'cluster') return 'default';
        return '';
      });

      await run();

      expect(core.info).toHaveBeenCalledWith('Amazon ECS Deploy Express Service action started');
      expect(core.info).toHaveBeenCalledWith('Container image: nginx:latest');
    });
  });

  describe('Input Trimming', () => {
    test('should fail when image input is only whitespace', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '   ';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/execution';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/infrastructure';
        return '';
      });

      await run();

      expect(core.setFailed).toHaveBeenCalledWith('Input required and not supplied: image');
    });
  });
});
