import {HStack, Avatar, Text, VStack} from "@chakra-ui/react"
import { useUser } from "../routing/AuthGuard"
import {useContext, useEffect} from "react";
import {ColumnDataContext} from "../App";
import {LoadingWidget} from "../routing/LoadingScreen";

export default function UserAvatar({userId, userAuth = null, inline = false, subtext = null, size = "sm"}) {
    // const user = useUser()

    const {users} = useContext(ColumnDataContext)
    useEffect(() => {}, [users])
    const user = (users !== null && userId in users) ? users[userId] : null

    const avatarUserName = (user !== null ? (user.first_name + " " + user.last_name) : (userAuth ? (userAuth.profile.first_name + " " + userAuth.profile.last_name) : ""))

    return (
    <HStack align="center" display={inline ? "inline-flex" : 'flex'} sx={{verticalAlign: 'center', minWidth: '125px'}}>
        <Avatar size={size} name={avatarUserName}/>
        <VStack align={'center'} justify={'center'} spacing={0} >
            <Text fontSize="sm" fontWeight="semibold">{avatarUserName}</Text>
            {(subtext ? (<Text fontSize="2xs" width={'100%'} fontWeight="light" color={"text.subtle"}>{subtext}</Text>) : null)}
        </VStack>

    </HStack>
    )
}