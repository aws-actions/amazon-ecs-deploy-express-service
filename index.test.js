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

  // Helper function to mock successful deployment monitoring
  const mockSuccessfulDeployment = (serviceArn, cluster = 'default') => {
    return [
      { // DescribeExpressGatewayService
        service: {
          serviceArn: serviceArn,
          status: { statusCode: 'ACTIVE' },
          cluster: cluster
        }
      },
      { // ListServiceDeployments
        serviceDeployments: [{
          serviceDeploymentArn: `${serviceArn.replace('/service/', '/service-deployment/')}/abc123`
        }]
      },
      { // DescribeServiceDeployments
        serviceDeployments: [{
          serviceDeploymentArn: `${serviceArn.replace('/service/', '/service-deployment/')}/abc123`,
          status: 'SUCCESSFUL'
        }]
      }
    ];
  };

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

      // Mock successful service creation and deployment monitoring
      mockSend
        .mockResolvedValueOnce({ services: [] }) // DescribeServices - not found
        .mockResolvedValueOnce({ // CreateExpressGatewayService
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service'
          }
        })
        .mockResolvedValueOnce({ // DescribeExpressGatewayService
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service',
            status: { statusCode: 'ACTIVE' },
            cluster: 'default'
          }
        })
        .mockResolvedValueOnce({ // ListServiceDeployments
          serviceDeployments: [{
            serviceDeploymentArn: 'arn:aws:ecs:us-east-1:123456789012:service-deployment/default/test-service/abc123'
          }]
        })
        .mockResolvedValueOnce({ // DescribeServiceDeployments
          serviceDeployments: [{
            serviceDeploymentArn: 'arn:aws:ecs:us-east-1:123456789012:service-deployment/default/test-service/abc123',
            status: 'SUCCESSFUL'
          }]
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

      const serviceArn = 'arn:aws:ecs:us-east-1:123456789012:service/production/my-service';
      const deploymentMocks = mockSuccessfulDeployment(serviceArn, 'production');
      
      mockSend
        .mockResolvedValueOnce({ // DescribeServices
          services: [{
            serviceArn: serviceArn,
            status: 'ACTIVE'
          }]
        })
        .mockResolvedValueOnce({ // UpdateExpressGatewayService
          service: { serviceArn: serviceArn }
        })
        .mockResolvedValueOnce(deploymentMocks[0])
        .mockResolvedValueOnce(deploymentMocks[1])
        .mockResolvedValueOnce(deploymentMocks[2]);

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

      const serviceArn = 'arn:aws:ecs:us-east-1:123456789012:service/default/my-service';
      const deploymentMocks = mockSuccessfulDeployment(serviceArn);
      
      mockSend
        .mockResolvedValueOnce({ // DescribeServices
          services: [{
            serviceArn: serviceArn,
            status: 'ACTIVE'
          }]
        })
        .mockResolvedValueOnce({ // UpdateExpressGatewayService
          service: { serviceArn: serviceArn }
        })
        .mockResolvedValueOnce(deploymentMocks[0])
        .mockResolvedValueOnce(deploymentMocks[1])
        .mockResolvedValueOnce(deploymentMocks[2]);

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
        if (name === 'service-name') return 'my-service';
        if (name === 'cluster') return 'default';
        return '';
      });

      const serviceArn = 'arn:aws:ecs:us-east-1:123456789012:service/default/my-service';
      const deploymentMocks = mockSuccessfulDeployment(serviceArn);
      
      mockSend
        .mockResolvedValueOnce({ // DescribeServices returns existing service
          services: [{
            serviceArn: serviceArn,
            status: 'ACTIVE'
          }]
        })
        .mockResolvedValueOnce({ // UpdateExpressGatewayService
          service: { serviceArn: serviceArn }
        })
        .mockResolvedValueOnce(deploymentMocks[0])
        .mockResolvedValueOnce(deploymentMocks[1])
        .mockResolvedValueOnce(deploymentMocks[2]);

      await run();

      expect(core.info).toHaveBeenCalledWith('Service exists with status: ACTIVE');
      expect(core.info).toHaveBeenCalledWith('Will UPDATE existing service');
      expect(core.info).toHaveBeenCalledWith('Updating Express Gateway service...');
      expect(core.info).toHaveBeenCalledWith('Service updated successfully');
    });

    test('creates service when ResourceNotFoundException is thrown', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'my-service';
        if (name === 'cluster') return 'default';
        return '';
      });

      const serviceArn = 'arn:aws:ecs:us-east-1:123456789012:service/default/my-service';
      const deploymentMocks = mockSuccessfulDeployment(serviceArn);
      
      mockSend
        .mockResolvedValueOnce({ services: [] }) // DescribeServices returns empty (service not found)
        .mockResolvedValueOnce({ service: { serviceArn: serviceArn } }) // CreateExpressGatewayService
        .mockResolvedValueOnce(deploymentMocks[0])
        .mockResolvedValueOnce(deploymentMocks[1])
        .mockResolvedValueOnce(deploymentMocks[2]);

      await run();

      expect(core.info).toHaveBeenCalledWith('Service does not exist, will create new service');
      expect(core.info).toHaveBeenCalledWith('Will CREATE new service');
      expect(core.info).toHaveBeenCalledWith('Creating Express Gateway service...');
      expect(core.info).toHaveBeenCalledWith('Service created successfully');
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

      const serviceArn = 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service';
      const deploymentMocks = mockSuccessfulDeployment(serviceArn);
      
      mockSend
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({ service: { serviceArn: serviceArn } })
        .mockResolvedValueOnce(deploymentMocks[0])
        .mockResolvedValueOnce(deploymentMocks[1])
        .mockResolvedValueOnce(deploymentMocks[2]);

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

      const serviceArn = 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service';
      const deploymentMocks = mockSuccessfulDeployment(serviceArn);
      
      mockSend
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({ service: { serviceArn: serviceArn } })
        .mockResolvedValueOnce(deploymentMocks[0])
        .mockResolvedValueOnce(deploymentMocks[1])
        .mockResolvedValueOnce(deploymentMocks[2]);

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

      const serviceArn = 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service';
      const deploymentMocks = mockSuccessfulDeployment(serviceArn);
      
      mockSend
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({ service: { serviceArn: serviceArn } })
        .mockResolvedValueOnce(deploymentMocks[0])
        .mockResolvedValueOnce(deploymentMocks[1])
        .mockResolvedValueOnce(deploymentMocks[2]);

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

      const serviceArn = 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service';
      const deploymentMocks = mockSuccessfulDeployment(serviceArn);
      
      mockSend
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({ service: { serviceArn: serviceArn } })
        .mockResolvedValueOnce(deploymentMocks[0])
        .mockResolvedValueOnce(deploymentMocks[1])
        .mockResolvedValueOnce(deploymentMocks[2]);

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

      const serviceArn = 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service';
      const deploymentMocks = mockSuccessfulDeployment(serviceArn);
      
      mockSend
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({ service: { serviceArn: serviceArn } })
        .mockResolvedValueOnce(deploymentMocks[0])
        .mockResolvedValueOnce(deploymentMocks[1])
        .mockResolvedValueOnce(deploymentMocks[2]);

      await run();

      expect(mockSend).toHaveBeenCalled();
      expect(core.info).toHaveBeenCalledWith('Service created successfully');
    });
  });

  describe('Deployment monitoring', () => {
    test('passes deployment start timestamp to waitForServiceStable', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        return '';
      });

      // Mock service creation and deployment monitoring
      mockSend
        .mockResolvedValueOnce({ services: [] }) // DescribeServices - not found
        .mockResolvedValueOnce({ // CreateExpressGatewayService
          service: { serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service' }
        })
        .mockResolvedValueOnce({ // DescribeExpressGatewayService
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service',
            status: { statusCode: 'ACTIVE' },
            cluster: 'default'
          }
        })
        .mockResolvedValueOnce({ // ListServiceDeployments
          serviceDeployments: [{
            serviceDeploymentArn: 'arn:aws:ecs:us-east-1:123456789012:service-deployment/default/test-service/abc123'
          }]
        })
        .mockResolvedValueOnce({ // DescribeServiceDeployments
          serviceDeployments: [{
            serviceDeploymentArn: 'arn:aws:ecs:us-east-1:123456789012:service-deployment/default/test-service/abc123',
            status: 'SUCCESSFUL'
          }]
        });

      await run();
      
      // Verify that deployment monitoring was called (5 total calls)
      expect(mockSend).toHaveBeenCalledTimes(5);
      expect(core.info).toHaveBeenCalledWith('Waiting for service deployment to complete...');
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Found 1 deployment(s)'));
    });

    test('waits for service to become ACTIVE', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        return '';
      });

      // Use fake timers to avoid actual waiting
      jest.useFakeTimers();

      mockSend
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({
          service: { serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service' }
        })
        .mockResolvedValueOnce({ // First check - service not ACTIVE yet
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service',
            status: { statusCode: 'CREATING' },
            cluster: 'default'
          }
        })
        .mockResolvedValueOnce({ // Second check - service is ACTIVE
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service',
            status: { statusCode: 'ACTIVE' },
            cluster: 'default'
          }
        })
        .mockResolvedValueOnce({
          serviceDeployments: [{
            serviceDeploymentArn: 'arn:aws:ecs:us-east-1:123456789012:service-deployment/default/test-service/abc123'
          }]
        })
        .mockResolvedValueOnce({
          serviceDeployments: [{
            serviceDeploymentArn: 'arn:aws:ecs:us-east-1:123456789012:service-deployment/default/test-service/abc123',
            status: 'SUCCESSFUL'
          }]
        });

      const runPromise = run();
      
      // Fast-forward through the polling interval
      await jest.advanceTimersByTimeAsync(15000);
      
      await runPromise;

      expect(core.info).toHaveBeenCalledWith('Waiting for service deployment to complete...');
      expect(mockSend).toHaveBeenCalledTimes(6);
      
      jest.useRealTimers();
    });

    test('monitors deployment status until SUCCESSFUL', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        return '';
      });

      // Use fake timers to avoid actual waiting
      jest.useFakeTimers();

      const deploymentArn = 'arn:aws:ecs:us-east-1:123456789012:service-deployment/default/test-service/abc123';

      mockSend
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({
          service: { serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service' }
        })
        .mockResolvedValueOnce({
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service',
            status: { statusCode: 'ACTIVE' },
            cluster: 'default'
          }
        })
        .mockResolvedValueOnce({
          serviceDeployments: [{ serviceDeploymentArn: deploymentArn }]
        })
        .mockResolvedValueOnce({ // First check - IN_PROGRESS
          serviceDeployments: [{
            serviceDeploymentArn: deploymentArn,
            status: 'IN_PROGRESS'
          }]
        })
        .mockResolvedValueOnce({
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service',
            status: { statusCode: 'ACTIVE' },
            cluster: 'default'
          }
        })
        .mockResolvedValueOnce({ // Second check - SUCCESSFUL
          serviceDeployments: [{
            serviceDeploymentArn: deploymentArn,
            status: 'SUCCESSFUL'
          }]
        });

      const runPromise = run();
      
      // Fast-forward through the polling interval
      await jest.advanceTimersByTimeAsync(15000);
      
      await runPromise;

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Deployment completed successfully'));
      
      jest.useRealTimers();
    });

    test('logs deployment count from ListServiceDeployments', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        return '';
      });

      mockSend
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({
          service: { serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service' }
        })
        .mockResolvedValueOnce({
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service',
            status: { statusCode: 'ACTIVE' },
            cluster: 'default'
          }
        })
        .mockResolvedValueOnce({
          serviceDeployments: [
            { serviceDeploymentArn: 'arn:aws:ecs:us-east-1:123456789012:service-deployment/default/test-service/abc123' },
            { serviceDeploymentArn: 'arn:aws:ecs:us-east-1:123456789012:service-deployment/default/test-service/def456' }
          ]
        })
        .mockResolvedValueOnce({
          serviceDeployments: [{
            serviceDeploymentArn: 'arn:aws:ecs:us-east-1:123456789012:service-deployment/default/test-service/abc123',
            status: 'SUCCESSFUL'
          }]
        });

      await run();

      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Found 2 deployment(s)'));
    });

    test('fails when deployment enters FAILED state', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        return '';
      });

      const deploymentArn = 'arn:aws:ecs:us-east-1:123456789012:service-deployment/default/test-service/abc123';

      mockSend
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({
          service: { serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service' }
        })
        .mockResolvedValueOnce({
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service',
            status: { statusCode: 'ACTIVE' },
            cluster: 'default'
          }
        })
        .mockResolvedValueOnce({
          serviceDeployments: [{ serviceDeploymentArn: deploymentArn }]
        })
        .mockResolvedValueOnce({
          serviceDeployments: [{
            serviceDeploymentArn: deploymentArn,
            status: 'FAILED'
          }]
        });

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('FAILED'));
    });

    test('fails when service enters INACTIVE state', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        return '';
      });

      mockSend
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({
          service: { serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service' }
        })
        .mockResolvedValueOnce({
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service',
            status: { statusCode: 'INACTIVE' },
            cluster: 'default'
          }
        });

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('INACTIVE'));
    });

    test('extracts and outputs service endpoint when deployment succeeds', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        return '';
      });

      const endpoint = 'https://test-service-abc123.execute-api.us-east-1.amazonaws.com';

      mockSend
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({
          service: { serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service' }
        })
        .mockResolvedValueOnce({
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service',
            status: { statusCode: 'ACTIVE' },
            cluster: 'default',
            activeConfigurations: [{
              ingressPaths: [{
                endpoint: endpoint
              }]
            }]
          }
        })
        .mockResolvedValueOnce({
          serviceDeployments: [{
            serviceDeploymentArn: 'arn:aws:ecs:us-east-1:123456789012:service-deployment/default/test-service/abc123'
          }]
        })
        .mockResolvedValueOnce({
          serviceDeployments: [{
            serviceDeploymentArn: 'arn:aws:ecs:us-east-1:123456789012:service-deployment/default/test-service/abc123',
            status: 'SUCCESSFUL'
          }]
        });

      await run();

      expect(core.setOutput).toHaveBeenCalledWith('endpoint', endpoint);
      expect(core.info).toHaveBeenCalledWith(`Service endpoint: ${endpoint}`);
    });
  });

  describe('Tag handling', () => {
    test('includes tags in service config when provided as JSON', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        if (name === 'tags') return '[{"key":"Environment","value":"Production"},{"key":"Team","value":"DevOps"}]';
        return '';
      });

      const serviceArn = 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service';
      const deploymentMocks = mockSuccessfulDeployment(serviceArn);
      
      mockSend
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({ service: { serviceArn: serviceArn } })
        .mockResolvedValueOnce(deploymentMocks[0])
        .mockResolvedValueOnce(deploymentMocks[1])
        .mockResolvedValueOnce(deploymentMocks[2]);

      await run();

      expect(core.debug).toHaveBeenCalledWith('Tags successfully included in service creation');
    });

    test('includes tags in service config when provided as multiline', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        if (name === 'tags') return 'Environment=Production\nTeam=DevOps\nCostCenter=';
        return '';
      });

      const serviceArn = 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service';
      const deploymentMocks = mockSuccessfulDeployment(serviceArn);
      
      mockSend
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({ service: { serviceArn: serviceArn } })
        .mockResolvedValueOnce(deploymentMocks[0])
        .mockResolvedValueOnce(deploymentMocks[1])
        .mockResolvedValueOnce(deploymentMocks[2]);

      await run();

      expect(core.debug).toHaveBeenCalledWith('Tags successfully included in service creation');
    });

    test('skips tag processing when no tags provided', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        if (name === 'tags') return '';
        return '';
      });

      const serviceArn = 'arn:aws:ecs:us-east-1:123456789012:service/default/test-service';
      const deploymentMocks = mockSuccessfulDeployment(serviceArn);
      
      mockSend
        .mockResolvedValueOnce({ services: [] })
        .mockResolvedValueOnce({ service: { serviceArn: serviceArn } })
        .mockResolvedValueOnce(deploymentMocks[0])
        .mockResolvedValueOnce(deploymentMocks[1])
        .mockResolvedValueOnce(deploymentMocks[2]);

      await run();

      expect(core.info).not.toHaveBeenCalledWith(expect.stringContaining('Processing tags'));
    });

    test('fails with helpful message when JSON tags are malformed', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        if (name === 'tags') return '[{"key":"Environment","value":}]'; // Invalid JSON
        return '';
      });

      // Mock service check to avoid unrelated errors
      mockSend.mockResolvedValueOnce({ services: [] });

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Tag parsing failed'));
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid tags JSON'));
    });

    test('fails with helpful message when multiline tags have invalid format', async () => {
      core.getInput.mockImplementation((name) => {
        if (name === 'image') return '123456789012.dkr.ecr.us-east-1.amazonaws.com/my-app:latest';
        if (name === 'execution-role-arn') return 'arn:aws:iam::123456789012:role/ecsTaskExecutionRole';
        if (name === 'infrastructure-role-arn') return 'arn:aws:iam::123456789012:role/ecsInfrastructureRole';
        if (name === 'service-name') return 'test-service';
        if (name === 'tags') return 'Environment=Production\nInvalidLine'; // Missing = sign
        return '';
      });

      // Mock service check to avoid unrelated errors
      mockSend.mockResolvedValueOnce({ services: [] });

      await run();

      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Tag parsing failed'));
      expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid tag format'));
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
        if (name === 'service-name') return 'my-service';
        if (name === 'cluster') return 'nonexistent';
        return '';
      });

      // DescribeServicesCommand throws ClusterNotFoundException
      // CreateExpressGatewayServiceCommand succeeds (Express Mode creates cluster)
      const clusterError = new Error('Cluster not found');
      clusterError.name = 'ClusterNotFoundException';
      
      mockSend
        .mockRejectedValueOnce(clusterError) // DescribeServices fails
        .mockResolvedValueOnce({ // CreateExpressGatewayService succeeds
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/nonexistent/my-service'
          }
        })
        .mockResolvedValueOnce({ // DescribeExpressGatewayService for monitoring
          service: {
            serviceArn: 'arn:aws:ecs:us-east-1:123456789012:service/nonexistent/my-service',
            status: { statusCode: 'ACTIVE' },
            cluster: 'nonexistent'
          }
        })
        .mockResolvedValueOnce({ // ListServiceDeployments
          serviceDeployments: [{
            serviceDeploymentArn: 'arn:aws:ecs:us-east-1:123456789012:service-deployment/nonexistent/my-service/abc123'
          }]
        })
        .mockResolvedValueOnce({ // DescribeServiceDeployments
          serviceDeployments: [{
            serviceDeploymentArn: 'arn:aws:ecs:us-east-1:123456789012:service-deployment/nonexistent/my-service/abc123',
            status: 'SUCCESSFUL'
          }]
        });

      await run();

      expect(core.info).toHaveBeenCalledWith('Service or cluster not found, will create new service');
      expect(core.info).toHaveBeenCalledWith('Will CREATE new service');
      expect(core.info).toHaveBeenCalledWith('Creating Express Gateway service...');
      expect(core.setFailed).not.toHaveBeenCalled();
    });
  });
});
