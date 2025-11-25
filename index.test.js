const run = require('./index');
const core = require('@actions/core');
const { ECSClient } = require('@aws-sdk/client-ecs');

jest.mock('@actions/core');
jest.mock('@aws-sdk/client-ecs');

describe('Amazon ECS Deploy Express Service', () => {
  let mockSend;
  let mockRegion;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock ECS client
    mockSend = jest.fn();
    mockRegion = jest.fn().mockResolvedValue('us-east-1');
    
    ECSClient.mockImplementation(() => ({
      send: mockSend,
      config: {
        region: mockRegion
      }
    }));
  });

  describe('Required input validation', () => {
    test('fails when image is missing', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        return '';
      });

      await run();

      expect(core.setFailed).toHaveBeenCalledWith('Input required and not supplied: image');
    });

    test('fails when execution-role-arn is missing', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return '';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        return '';
      });

      await run();

      expect(core.setFailed).toHaveBeenCalledWith('Input required and not supplied: execution-role-arn');
    });

    test('fails when infrastructure-role-arn is missing', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return '';
        if (name === 'service-name') return 'test-service';
        return '';
      });

      await run();

      expect(core.setFailed).toHaveBeenCalledWith('Input required and not supplied: infrastructure-role-arn');
    });

    test('succeeds when all required inputs are provided', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        if (name === 'cluster') return 'default';
        return '';
      });

      // Mock successful service creation
      mockSend.mockResolvedValue({
        service: {
          serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service'
        }
      });

      await run();

      expect(core.setFailed).not.toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Amazon ECS Deploy Express Service action started');
    });
  });

  describe('Service ARN construction', () => {
    test('constructs ARN with provided cluster', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'my-service';
        if (name === 'cluster') return 'production';
        return '';
      });

      // First call: DescribeClustersCommand
      // Second call: DescribeServicesCommand
      // Third call: UpdateExpressGatewayServiceCommand
      mockSend
        .mockResolvedValueOnce({
          clusters: [{
            clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/production',
            status: 'ACTIVE'
          }]
        })
        .mockResolvedValueOnce({
          services: [{
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/production/my-service',
            status: 'ACTIVE'
          }]
        })
        .mockResolvedValueOnce({
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/production/my-service'
          }
        });

      await run();

      expect(core.info).toHaveBeenCalledWith('Constructed service ARN: arn:aws:ecs:us-east-1:123456789012:service/production/my-service');
    });

    test('constructs ARN with default cluster', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'my-service';
        return '';
      });

      // First call: DescribeClustersCommand
      // Second call: DescribeServicesCommand
      // Third call: UpdateExpressGatewayServiceCommand
      mockSend
        .mockResolvedValueOnce({
          clusters: [{
            clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/default',
            status: 'ACTIVE'
          }]
        })
        .mockResolvedValueOnce({
          services: [{
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/my-service',
            status: 'ACTIVE'
          }]
        })
        .mockResolvedValueOnce({
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/my-service'
          }
        });

      await run();

      expect(core.info).toHaveBeenCalledWith('Constructed service ARN: arn:aws:ecs:us-east-1:123456789012:service/default/my-service');
    });
  });

  describe('Create vs Update logic', () => {
    test('updates service when it exists', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        if (name === 'service-name') return 'my-service';
        if (name === 'cluster') return 'default';
        return '';
      });

      // First call: DescribeServicesCommand returns existing service
      // Second call: UpdateExpressGatewayServiceCommand
      mockSend
        .mockResolvedValueOnce({
          services: [{
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/my-service',
            status: 'ACTIVE'
          }]
        })
        .mockResolvedValueOnce({
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/my-service'
          }
        });

      await run();

      expect(core.info).toHaveBeenCalledWith('Service exists with status: ACTIVE');
      expect(core.info).toHaveBeenCalledWith('Will UPDATE existing service');
      expect(core.info).toHaveBeenCalledWith('Updating Express Gateway service...');
      expect(core.info).toHaveBeenCalledWith('Service updated successfully');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    test('creates service when ResourceNotFoundException is thrown', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        if (name === 'service-name') return 'my-service';
        if (name === 'cluster') return 'default';
        return '';
      });

      // First call: DescribeServicesCommand returns empty (service not found)
      // Second call: CreateExpressGatewayServiceCommand
      mockSend
        .mockResolvedValueOnce({
          services: []
        })
        .mockResolvedValueOnce({
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/my-service'
          }
        });

      await run();

      expect(core.info).toHaveBeenCalledWith('Service does not exist, will create new service');
      expect(core.info).toHaveBeenCalledWith('Will CREATE new service');
      expect(core.info).toHaveBeenCalledWith('Creating Express Gateway service...');
      expect(core.info).toHaveBeenCalledWith('Service created successfully');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    test('fails when service-name is missing', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        if (name === 'service-name') return '';
        return '';
      });

      await run();

      expect(core.setFailed).toHaveBeenCalled();
    });
  });

  describe('SDK command input building', () => {
    test('includes required fields in service config', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        return '';
      });

      // First call: DescribeClustersCommand
      // Second call: CreateExpressGatewayServiceCommand
      mockSend
        .mockResolvedValueOnce({
          clusters: [{
            clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/default',
            status: 'ACTIVE'
          }]
        })
        .mockResolvedValueOnce({
          service: { serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test' }
        });

      await run();

      expect(mockSend).toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Service created successfully');
    });

    test('includes optional container port when provided', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        if (name === 'container-port') return '8080';
        return '';
      });

      mockSend
        .mockResolvedValueOnce({
          clusters: [{ clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/default', status: 'ACTIVE' }]
        })
        .mockResolvedValueOnce({
          service: { serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test' }
        });

      await run();

      expect(mockSend).toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Service created successfully');
    });

    test('includes environment variables when provided', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        if (name === 'environment-variables') return '[{"name":"ENV","value":"prod"}]';
        return '';
      });

      mockSend
        .mockResolvedValueOnce({
          clusters: [{ clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/default', status: 'ACTIVE' }]
        })
        .mockResolvedValueOnce({
          service: { serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test' }
        });

      await run();

      expect(mockSend).toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Service created successfully');
    });

    test('includes CPU and memory as strings when provided', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        if (name === 'cpu') return '512';
        if (name === 'memory') return '1024';
        return '';
      });

      mockSend
        .mockResolvedValueOnce({
          clusters: [{ clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/default', status: 'ACTIVE' }]
        })
        .mockResolvedValueOnce({
          service: { serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test' }
        });

      await run();

      expect(mockSend).toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Service created successfully');
    });

    test('includes scaling configuration when provided', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        if (name === 'min-task-count') return '1';
        if (name === 'max-task-count') return '10';
        if (name === 'auto-scaling-metric') return 'AVERAGE_CPU';
        if (name === 'auto-scaling-target-value') return '70';
        return '';
      });

      mockSend
        .mockResolvedValueOnce({
          clusters: [{ clusterArn: 'arn:aws:ecs:us-east-1:123456789012:cluster/default', status: 'ACTIVE' }]
        })
        .mockResolvedValueOnce({
          service: { serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test' }
        });

      await run();

      expect(mockSend).toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Service created successfully');
    });
  });

  describe('Error handling', () => {
    test('handles AccessDeniedException with helpful message', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        return '';
      });

      const accessError = new Error('Access denied');
      accessError.name = 'AccessDeniedException';
      // Cluster check fails with access denied
      mockSend.mockRejectedValue(accessError);

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Access denied')
      );
    });

    test('handles InvalidParameterException with helpful message', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        return '';
      });

      const paramError = new Error('Invalid parameter');
      paramError.name = 'InvalidParameterException';
      mockSend.mockRejectedValue(paramError);

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(
        expect.stringContaining('Invalid parameter')
      );
    });

    test('handles ClusterNotFoundException gracefully during service check', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        if (name === 'service-name') return 'my-service';
        if (name === 'cluster') return 'nonexistent';
        return '';
      });

      // DescribeServicesCommand throws ClusterNotFoundException
      // CreateExpressGatewayServiceCommand succeeds (Express Mode creates cluster)
      const clusterError = new Error('Cluster not found');
      clusterError.name = 'ClusterNotFoundException';
      
      mockSend
        .mockRejectedValueOnce(clusterError)
        .mockResolvedValueOnce({
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/nonexistent/my-service'
          }
        });

      await run();

      expect(core.info).toHaveBeenCalledWith('Service or cluster not found, will create new service');
      expect(core.info).toHaveBeenCalledWith('Will CREATE new service');
      expect(core.info).toHaveBeenCalledWith('Creating Express Gateway service...');
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });
});
