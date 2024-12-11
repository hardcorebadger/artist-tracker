import {useContext, useEffect, useState} from "react";
import ArtistDetailNew from "../components/ArtistDetailNew";
import {PageLayoutContained} from "../layouts/DashboardLayout";
import LoadingScreen from "../routing/LoadingScreen";
import {useNavigate, useParams} from "react-router-dom";
import {ColumnDataContext, CurrentReportContext} from "../App";
import {httpsCallable} from "firebase/functions";
import {functions} from "../firebase";
import {useToast} from "@chakra-ui/react";

function PageArtist() {
    const { artistId } = useParams()
    const {  setActiveArtist, activeArtist, linkSources, statisticTypes } = useContext(ColumnDataContext);
    const {currentQueryModel} = useContext(CurrentReportContext);
    const toast = useToast();
    const navigate = useNavigate()
    const loadArtist = async (force = false) => {
        const getArtist = httpsCallable(functions, 'get_artists')
        if (force || !activeArtist?.hasOwnProperty('attributions') || activeArtist === null || activeArtist.id !== artistId) {
            getArtist({"id": artistId}).then((response) => {
                // console.log(response);
                if (!response.data.error) {
                    setActiveArtist(response.data.artist)
                } else {
                    toast({
                        title: 'Failed to load artist',
                        description: "An error occurred while loading the artist.",
                        status: 'error',
                        duration: 9000,
                        isClosable: true,
                    })
                }

            });
        }
    }

    useEffect(() => {
        if (!activeArtist?.hasOwnProperty('attributions') || activeArtist === null || activeArtist.id !== artistId) {
            if ( activeArtist?.id !== artistId) {
                setActiveArtist(null)
            }
            loadArtist()
        }
    }, [artistId])

    useEffect(() => {

    }, [activeArtist, linkSources]);


    if (linkSources === null || activeArtist === null) {
        return (
            <LoadingScreen/>
        )
    }
    return (
        <PageLayoutContained size="lg">
            <ArtistDetailNew artist={activeArtist} linkSources={linkSources} statisticTypes={statisticTypes} onNavigateBack={currentQueryModel ? (()=> {
                navigate(-1)
            }): null}
                onTagSave={() => {
                    loadArtist(true)
                }}
            />
        </PageLayoutContained>


    )
}

export default PageArtist;
