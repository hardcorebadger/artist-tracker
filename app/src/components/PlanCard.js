import { VStack, Text, Card, Radio, HStack } from "@chakra-ui/react";
import Iconify from "./Iconify"; // Assuming Iconify is used in FeaturePoint

export function FeaturePoint({ has = true, children }) {
    return (
        <HStack>
            <Iconify icon={has ? "material-symbols:check" : "material-symbols:close"} color={has ? "green.400" : "red.400"} size={20} />
            <Text fontSize="md" color="text.subtle">{children}</Text>
        </HStack>
    );
}
function PlanCard({ value, isSelected, isDisabled, onChange, planName, price, description, features }) {
    const handleCardClick = () => {
        if (!isDisabled && typeof onChange === "function") {
            onChange(value);
        }
    };

    return (
        <Card
            p="30"
            opacity={isDisabled ? 0.6 : undefined}
            cursor={isDisabled ? "not-allowed" : "pointer"} // Change cursor to pointer for non-disabled cards
            pointerEvents={isDisabled ? "none" : undefined} // Prevent clicks on disabled cards
            onClick={handleCardClick} // Make the whole card clickable
        >
            <VStack align="left" spacing={7}>
                <VStack align="left" spacing={2}>
                    <Radio value={value} isChecked={isSelected} isDisabled={isDisabled} onChange={() => onChange(value)}>
                        <Text fontSize="lg" fontWeight="bold">{planName}</Text>
                    </Radio>
                    <Text fontSize="3xl">{price}</Text>
                    <Text fontSize="md">{description}</Text>
                </VStack>
                <VStack spacing={1} align="left">
                    {features.map((feature, index) => (
                        <FeaturePoint key={index} has={feature.has}>
                            {feature.text}
                        </FeaturePoint>
                    ))}
                </VStack>
            </VStack>
        </Card>
    );
}

export default PlanCard;