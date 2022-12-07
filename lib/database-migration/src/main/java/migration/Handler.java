package migration;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.LambdaLogger;
import com.amazonaws.services.lambda.runtime.events.CloudFormationCustomResourceEvent;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import liquibase.Contexts;
import liquibase.Liquibase;
import liquibase.database.Database;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;
import liquibase.resource.ClassLoaderResourceAccessor;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.secretsmanager.SecretsManagerClient;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueRequest;
import software.amazon.awssdk.services.secretsmanager.model.GetSecretValueResponse;
import software.amazon.lambda.powertools.cloudformation.AbstractCustomResourceHandler;
import software.amazon.lambda.powertools.cloudformation.Response;

import java.sql.DriverManager;

public class Handler extends AbstractCustomResourceHandler {

    @Override
    protected Response create(CloudFormationCustomResourceEvent createEvent, Context context) {
        return migrateDatabase(context);
    }

    @Override
    protected Response update(CloudFormationCustomResourceEvent updateEvent, Context context) {
        return migrateDatabase(context);
    }

    @Override
    protected Response delete(CloudFormationCustomResourceEvent deleteEvent, Context context) {
        return Response.success();
    }

    private Response migrateDatabase(Context context) {
        LambdaLogger logger = context.getLogger();
        try {
            SecretString secretString = getDatabaseSecret(logger);

            String host = secretString.host;
            int port = secretString.port;
            String dbname = secretString.dbname;
            String username = secretString.username;
            String password = secretString.password;
            String databaseUrl = "jdbc:postgresql://" + host + ":" + port + "/" + dbname;
            logger.log("Built database connection string");

            logger.log("Establishing connection");
            java.sql.Connection connection = DriverManager.getConnection(databaseUrl,
                    username, password);
            try {
                Database database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(connection));
                logger.log("Connection established");
                Liquibase liquibase = new Liquibase("liquibase/changelog-main.xml", new ClassLoaderResourceAccessor(), database);
                liquibase.update(new Contexts());
                logger.log("Finished update");
            } finally {
                if (connection != null) {
                    connection.rollback();
                    connection.close();
                }
            }
            return Response.success();
        } catch (Exception e) {
            logger.log("Exception while upgrading database");
            logger.log(e.getMessage());
            return Response.failed();
        }
    }

    private SecretString getDatabaseSecret(LambdaLogger logger) {
        logger.log("Accessing SecretsManager");
        String secretName = System.getenv("DATABASE_SECRET_NAME");
        Region region = Region.of(System.getenv("REGION"));
        SecretsManagerClient secretsClient = SecretsManagerClient.builder()
                .region(region)
                .build();

        GetSecretValueRequest valueRequest = GetSecretValueRequest.builder()
                .secretId(secretName)
                .build();

        GetSecretValueResponse valueResponse = secretsClient.getSecretValue(valueRequest);
        Gson gson = new GsonBuilder().create();
        return gson.fromJson(valueResponse.secretString(), SecretString.class);
    }
}

class SecretString{
    String dbClusterIdentifier;
    String password;
    String dbname;
    String engine;
    int port;
    String host;
    String username;
}
