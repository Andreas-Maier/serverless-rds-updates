import {
  BundlingOutput,
  CustomResource,
  Duration,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import { Credentials, IServerlessCluster } from "aws-cdk-lib/aws-rds";
import { Provider } from "aws-cdk-lib/custom-resources";
import {
  Effect,
  ManagedPolicy,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { ISecurityGroup, IVpc, SubnetType } from "aws-cdk-lib/aws-ec2";

export interface DatabaseMigrationProps extends StackProps {
  database: IServerlessCluster;
  credentials: Credentials;
  vpc: IVpc;
  databaseMigrationSecurityGroup: ISecurityGroup;
}

export class DatabaseMigrationStack extends Stack {
  constructor(scope: Construct, id: string, props: DatabaseMigrationProps) {
    super(scope, id, props);

    let secretsManagerPolicyStatement = new PolicyStatement();
    secretsManagerPolicyStatement.effect = Effect.ALLOW;
    secretsManagerPolicyStatement.addActions(
      "secretsmanager:GetResourcePolicy",
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
      "secretsmanager:ListSecretVersionIds"
    );
    secretsManagerPolicyStatement.addResources(
      "arn:aws:secretsmanager:" +
        props.database.env.region +
        ":" +
        props.database.env.account +
        ":secret:" +
        props.credentials.secretName +
        "*"
    );

    let createENIPolicyStatement = new PolicyStatement();
    createENIPolicyStatement.effect = Effect.ALLOW;
    createENIPolicyStatement.addActions(
      "ec2:DescribeNetworkInterfaces",
      "ec2:CreateNetworkInterface",
      "ec2:DeleteNetworkInterface",
      "ec2:DescribeInstances",
      "ec2:AttachNetworkInterface"
    );
    createENIPolicyStatement.addResources("*");
    let policy = new PolicyDocument();
    policy.addStatements(
      secretsManagerPolicyStatement,
      createENIPolicyStatement
    );
    const databaseMigrationFunctionRole = new Role(
      this,
      "DatabaseMigrationFunctionRole",
      {
        assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
        inlinePolicies: {
          customSSMAccessPolicy: policy,
        },
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole"
          ),
        ],
      }
    );

    const databaseMigrationFunction = new Function(
      this,
      "DatabaseMigrationFunction",
      {
        runtime: Runtime.JAVA_11,
        code: Code.fromAsset(path.join(__dirname, "./database-migration"), {
          bundling: {
            image: Runtime.JAVA_11.bundlingImage,
            user: "root",
            outputType: BundlingOutput.ARCHIVED,
            command: [
              "/bin/sh",
              "-c",
              "mvn clean install " +
                "&& cp /asset-input/target/databaseMigration.jar /asset-output/",
            ],
          },
        }),
        handler: "migration.Handler",
        environment: {
          DATABASE_SECRET_NAME: props.credentials.secretName!,
          REGION: props.database.env.region,
        },
        vpc: props.vpc,
        vpcSubnets: props.vpc.selectSubnets({
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        }),
        securityGroups: [props.databaseMigrationSecurityGroup],
        timeout: Duration.minutes(5),
        memorySize: 512,
        role: databaseMigrationFunctionRole,
      }
    );

    props.credentials.secret?.grantRead(databaseMigrationFunctionRole);

    const databaseMigrationFunctionProvider = new Provider(
      this,
      "DatabaseMigrationResourceProvider",
      {
        onEventHandler: databaseMigrationFunction,
      }
    );

    new CustomResource(this, "DatabaseMigrationResource", {
      serviceToken: databaseMigrationFunctionProvider.serviceToken,
      properties: {
        date: new Date(Date.now()).toUTCString(),
      },
    });
  }
}
