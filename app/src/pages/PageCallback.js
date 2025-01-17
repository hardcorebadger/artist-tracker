import {useUser} from "../routing/AuthGuard";
import {VStack, Text} from "@chakra-ui/react";
import {PageLayoutContained} from "../layouts/DashboardLayout";
import {useSearchParams} from "react-router-dom";
import {useEffect, useState} from "react";
import {goFetch} from "../App";
import {spotify_redirect} from "../firebase";


export default function PageCallback() {
    const user = useUser()
    const [searchParams, setSearchParams] = useSearchParams();
    const [code, setCode] = useState(searchParams.get('code') ?? null)
    const error = (searchParams.get('error') ?? null);
    const [running, setRunning] = useState(false)
    const state = searchParams.get('state')
    useEffect(() => {
        if (!running) {
            setRunning(true)
            const resp = goFetch(user, 'POST', 'spotify-auth', {code: code, redirect_uri: spotify_redirect, state: state})
            console.log(resp)
        }
    }, [])
    if (!state.startsWith(user.auth.uid) || error !== null) {
        return (
            <PageLayoutContained size="lg">
                <VStack spacing={10} align="left">
                    <Text>{error !== null ? error : "Woops! Invalid State. Please try again."}</Text>
                </VStack>
            </PageLayoutContained>
        )
    }


    return (

        <PageLayoutContained size="lg">
            <VStack spacing={10} align="left">
                <Text>Spotify Account Link</Text>

            </VStack>
        </PageLayoutContained>

    )
}