# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## 1.0.0 (2025-12-01)


### Features

* Expanding support for Create and Describe ([aeae5d8](https://github.com/aws-actions/amazon-ecs-deploy-express-service/commit/aeae5d8159157c7d5e375ae7d51aba9318396b25))
* Require service-name as input ([#3](https://github.com/aws-actions/amazon-ecs-deploy-express-service/issues/3)) ([4fe4c1d](https://github.com/aws-actions/amazon-ecs-deploy-express-service/commit/4fe4c1d14c93216b1796662ec2613aeefa2f3226))
* Update README for v1 release ([#10](https://github.com/aws-actions/amazon-ecs-deploy-express-service/issues/10)) ([039760b](https://github.com/aws-actions/amazon-ecs-deploy-express-service/commit/039760b74105975e199a4de3e7ef8f40b1c85f9f))

## [1.0.0] - 2024-12-01

### Features

* Initial release of Amazon ECS Deploy Express Service action
* Support for creating and updating ECS Express Mode services
* Automatic infrastructure provisioning (ALB, target groups, security groups)
* Container configuration with environment variables and secrets
* Resource configuration (CPU, memory, task role)
* Network configuration (subnets, security groups)
* Health check configuration
* Auto-scaling configuration with multiple metrics
* Deployment monitoring with status tracking
* Service endpoint output

### Documentation

* Comprehensive README with usage examples
* IAM permissions documentation
* Troubleshooting guide
* Contributing guidelines
* Code of conduct

[1.0.0]: https://github.com/aws-actions/amazon-ecs-deploy-express-service/releases/tag/v1.0.0
