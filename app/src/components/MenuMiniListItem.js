import {Checkbox, HStack, MenuItem, Text} from "@chakra-ui/react";

export default function MenuMiniListItem({title, itemKey, isChecked, toggle}) {
    return (
        <MenuItem>
            <HStack w="100%" justifyContent="space-between">
                <Text fontSize="sm">
                    {title}
                </Text>
                <Checkbox
                    colorScheme='primary'
                    isChecked={isChecked}
                    onChange={e => toggle(itemKey, e.target.checked)}>
                </Checkbox>
            </HStack>
        </MenuItem>
    )
}