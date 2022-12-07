import { Duration, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  AuroraCapacityUnit,
  AuroraPostgresEngineVersion,
  Credentials,
  DatabaseClusterEngine,
  IServerlessCluster,
  ServerlessCluster,
  SubnetGroup,
} from "aws-cdk-lib/aws-rds";
import { ISecurityGroup, IVpc, SubnetType } from "aws-cdk-lib/aws-ec2";

export interface DatabaseProps extends StackProps {
  vpc: IVpc;
  databaseSecurityGroup: ISecurityGroup;
}

export class DatabaseStack extends Stack {
  readonly database: IServerlessCluster;
  readonly credentials: Credentials;

  constructor(scope: Construct, id: string, props: DatabaseProps) {
    super(scope, id, props);

    const username = "clusteradmin";
    this.credentials = Credentials.fromGeneratedSecret(username, {
      secretName: "/aurora/databaseSecrets",
    });

    const databaseSubnetGroup = new SubnetGroup(this, "DatabaseSubnetGroup", {
      description: "SubnetGroup for Aurora Serverless",
      vpc: props.vpc,
      vpcSubnets: props.vpc.selectSubnets({
        subnetType: SubnetType.PRIVATE_WITH_EGRESS,
      }),
    });
    this.database = new ServerlessCluster(this, "DemoCluster", {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_11_16,
      }),
      credentials: this.credentials,
      enableDataApi: true,
      defaultDatabaseName: "demo",
      vpc: props.vpc,
      subnetGroup: databaseSubnetGroup,
      securityGroups: [props.databaseSecurityGroup],
      scaling: {
        autoPause: Duration.minutes(5),
        minCapacity: AuroraCapacityUnit.ACU_2,
        maxCapacity: AuroraCapacityUnit.ACU_4,
      },
    });
  }
}
