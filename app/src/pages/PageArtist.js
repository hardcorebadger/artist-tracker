import {useContext, useEffect, useState} from "react";
import ArtistDetailNew from "../components/ArtistDetailNew";
import {PageLayoutContained} from "../layouts/DashboardLayout";
import LoadingScreen from "../routing/LoadingScreen";
import {useNavigate, useParams} from "react-router-dom";
import {ColumnDataContext, CurrentReportContext} from "../App";
import {httpsCallable} from "firebase/functions";
import {functions} from "../firebase";

function PageArtist() {
    const { artistId } = useParams()
    const {  setActiveArtist, activeArtist, linkSources } = useContext(ColumnDataContext);
    const {currentQueryModel} = useContext(CurrentReportContext);

    const navigate = useNavigate()
    const loadArtist = async () => {
        const getArtist = httpsCallable(functions, 'get_artists')
        if (activeArtist === null || activeArtist.id !== artistId) {
            getArtist({"id": artistId}).then((response) => {
                setActiveArtist(response.data)

            });
        }
    }

    useEffect(() => {
        if (activeArtist === null || activeArtist.id !== artistId) {
            setActiveArtist(null)
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
            <ArtistDetailNew artist={activeArtist} linkSources={linkSources} onNavigateBack={currentQueryModel ? (()=> {
                navigate(-1)
            }): null}/>
        </PageLayoutContained>


    )
}

export default PageArtist;
