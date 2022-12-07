import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { DatabaseMigrationStack } from "./database-migration-stack";
import { DatabaseStack } from "./database-stack";
import { Port, SecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";

export class ApplicationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new Vpc(this, "DemoVpc");

    const databaseSecurityGroup = new SecurityGroup(
      this,
      "DatabaseSecurityGroup",
      {
        securityGroupName: "DatabaseSecurityGroup",
        vpc,
      }
    );
    const databaseMigrationSecurityGroup = new SecurityGroup(
      this,
      "DatabaseMigrationSecurityGroup",
      {
        securityGroupName: "DatabaseMigrationSecurityGroup",
        vpc,
      }
    );
    databaseSecurityGroup.addIngressRule(
      databaseMigrationSecurityGroup,
      Port.tcp(5432),
      "allow access for database migration lambda"
    );

    const databaseStack = new DatabaseStack(this, "DatabaseStack", {
      vpc: vpc,
      databaseSecurityGroup: databaseSecurityGroup,
      ...props,
    });
    const databaseMigrationStack = new DatabaseMigrationStack(
      this,
      "DatabaseMigrationStack",
      {
        database: databaseStack.database,
        credentials: databaseStack.credentials,
        vpc,
        databaseMigrationSecurityGroup: databaseMigrationSecurityGroup,
        ...props,
      }
    );
    databaseMigrationStack.addDependency(databaseStack);
  }
}
