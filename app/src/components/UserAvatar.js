import { HStack, Avatar, Text } from "@chakra-ui/react"
import { useUser } from "../routing/AuthGuard"
import {useContext} from "react";
import {ColumnDataContext} from "../App";
import {LoadingWidget} from "../routing/LoadingScreen";

export default function UserAvatar({userId, inline = false}) {
    // const user = useUser()

    const {users} = useContext(ColumnDataContext)
    if (!users  || users.length === 0) {
        return (<LoadingWidget/>)
    }
    const user = users[userId]

    const avatarUserName = user.first_name + " " + user.last_name

    return (
    <HStack align="center" display={inline ? "inline-flex" : 'flex'} sx={{verticalAlign: 'center'}}>
        <Avatar size="sm" name={avatarUserName}/>
        <Text fontSize="sm" fontWeight="semibold">{avatarUserName}</Text>
    </HStack>
    )
}