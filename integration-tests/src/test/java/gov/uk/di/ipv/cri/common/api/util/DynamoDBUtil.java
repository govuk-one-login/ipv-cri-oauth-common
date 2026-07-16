package gov.uk.di.ipv.cri.common.api.util;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemResponse;

import java.util.Map;

public final class DynamoDBUtil {

    private static final DynamoDbClient CLIENT = DynamoDbClient.builder()
            .region(Region.of(System.getenv("AWS_REGION")))
            .build();

    private DynamoDBUtil() {}

    public static boolean sessionExists(String tableName, String sessionId) {
        GetItemRequest request = GetItemRequest.builder()
                .tableName(tableName)
                .key(Map.of(
                        "sessionId",
                        AttributeValue.builder()
                                .s(sessionId)
                                .build()))
                .build();

        GetItemResponse response = CLIENT.getItem(request);

        return response.hasItem() && !response.item().isEmpty();
    }
}