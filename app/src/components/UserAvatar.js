import { HStack, Avatar, Text } from "@chakra-ui/react"
import { useUser } from "../routing/AuthGuard"

export default function UserAvatar({userId}) {
    const user = useUser()

    const avatarUserName = user.org.users[userId].first_name + " " + user.org.users[userId].last_name

    return (
    <HStack align="center">
        <Avatar size="sm" name={avatarUserName}/>
        <Text fontSize="sm" fontWeight="semibold">{avatarUserName}</Text>
    </HStack>
    )
}