// import DataGrid2 from '../components/DataGrid2';
import MuiDataGridController from '../components/MuiDataGridServer'
import { setDoc, doc, getDoc, addDoc, collection, deleteDoc } from 'firebase/firestore';
import {db, functions} from '../firebase';
import { useUser } from '../routing/AuthGuard';
import { useParams } from 'react-router-dom';
import { useDocument } from 'react-firebase-hooks/firestore';
import { useNavigate } from 'react-router-dom';
import { Box, Button, HStack, Heading, Skeleton, Text, VStack } from '@chakra-ui/react';
import {useContext, useEffect, useState} from 'react';
import { PageLayoutContained } from '../layouts/DashboardLayout';
import {ColumnDataContext, CurrentReportContext} from "../App";
import {httpsCallable} from "firebase/functions";
import ArtistDetailNew from "../components/ArtistDetailNew";
import LoadingScreen from "../routing/LoadingScreen";

function PageArtistReport() {
  const user = useUser()
  const navigate = useNavigate()
  const { id } = useParams()
  const { statisticTypes, linkSources, setActiveArtist, activeArtist } = useContext(ColumnDataContext);
  const { setCurrentReport, currentReport, setCurrentRows, setCurrentQueryModel } = useContext(CurrentReportContext);

  async function getDocument(collectionName, documentId) {
    try {
      const docRef = doc(db, collectionName, documentId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return docSnap.data();
      } else {
        return false
      }
    } catch (error) {
      console.error("Error getting document:", error);
    }
  }

  useEffect(() => {
    const check = async () =>
    {
      if (currentReport === null || currentReport.id !== id) {
        setCurrentRows(null)
        setCurrentQueryModel(null)
        const documentData = await getDocument("reports", id);
        if (documentData) {
            setCurrentReport({
              id: id,
              data: documentData
            })
        }
      }
    }
    check()
  }, [id, currentReport]);
  if (currentReport === null || currentReport?.id !== id) {

      return (
          <VStack spacing={5} align="left">
            <HStack px={6} justifyContent='space-between'>
              <VStack spacing={3} align="left">
                <Skeleton isLoaded={false}>
                  <Heading size="md">Loading Report</Heading>
                </Skeleton>
                <Skeleton isLoaded={false}>
                  <Text size="sm" color="text.subtle">Artist Report</Text>
                </Skeleton>
              </VStack>
              <HStack>
                <Skeleton><Button>Loading</Button></Skeleton>
              </HStack>
            </HStack>
          </VStack>
      )
  }


  const onOpenArtist = (artist) => {
    setActiveArtist(artist);
    navigate(`/app/reports/`+id+`/artists/${artist.id}`);
  }

  // some url for new reports
  // on save, create a new report
  // then reload to that new url

  // if the url has a report ID
  // load the report
  // pass the props
  // on save, overwrite
  // automatically pass the new props
  // cause rerender

  const onReportSave = async (columnOrder, filterValue, reportName) => {
    await setDoc(doc(db, 'reports', id), {
      organization: user.org.id,
      last_modified_by: user.auth.uid,
      last_modified_on: Date.now(),
      created_on: currentReport?.data.created_on,
      created_by: currentReport?.data.created_by,
      type: 'artist',
      name: reportName,
      columnOrder: columnOrder,
      filterValue: filterValue
    })
    setCurrentReport(null)
  }

  const onReportSaveNew = async (columnOrder, filterValue, reportName) => {
    const docRef = await addDoc(collection(db, 'reports'), {
      organization: user.org.id,
      last_modified_by: user.auth.uid,
      last_modified_on: Date.now(),
      created_by: user.auth.uid,
      created_on: Date.now(),
      type: 'artist',
      name: reportName,
      columnOrder: columnOrder,
      filterValue: filterValue
    })
    navigate('/app/reports/'+docRef.id)
  }

  const onReportDelete = async() => {
    await deleteDoc(doc(db, 'reports', id))
    navigate('/app/reports/all')
  }
  if (statisticTypes === null || linkSources === null) {
    return (
        <LoadingScreen/>
    )
  }
  return (
    <Box sx={{height:'auto', maxWidth: '100%'}} >
    <MuiDataGridController
    initialReportName={currentReport?.data.name}
    initialColumnOrder={currentReport?.data.columnOrder}
    initialFilterValues={currentReport?.data.filterValue}
    onSave={onReportSave} 
    onSaveNew={onReportSaveNew} 
    onDelete={onReportDelete}
    onOpenArtist={onOpenArtist}
    />
    </Box>
  );
}

export default PageArtistReport;
