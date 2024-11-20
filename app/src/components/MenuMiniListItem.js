import {Checkbox, HStack, MenuItem, Text} from "@chakra-ui/react";

export default function MenuMiniListItem({parentKey, subKey, columnSelection, title, setColumn}) {
    return (
        <MenuItem>
            <HStack w="100%" justifyContent="space-between">
                <Text fontSize="sm">
                    {title}
                </Text>
                <Checkbox
                    colorScheme='primary'
                    isChecked={columnSelection[parentKey][subKey]}
                    onChange={e => setColumn(e.target.checked, parentKey, subKey)}>
                </Checkbox>
            </HStack>
        </MenuItem>
    )
}