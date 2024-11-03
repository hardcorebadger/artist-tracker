// import DataGrid2 from '../components/DataGrid2';
import MuiDataGridController from '../components/MuiDataGridServer'
// import { defaultColumnOrder, defaultColumnSelection, buildDefaultFilters } from '../components/DataGridConfig';
import { setDoc, doc, getDoc, addDoc, collection, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useUser } from '../routing/AuthGuard';
import { useParams } from 'react-router-dom';
import { useDocument } from 'react-firebase-hooks/firestore';
import { useNavigate } from 'react-router-dom';
import { Box, Button, HStack, Heading, Skeleton, Text, VStack } from '@chakra-ui/react';
import { useState } from 'react';
import ArtistDetail from '../components/ArtistDetail';
import { PageLayoutContained } from '../layouts/DashboardLayout';

function PageArtistReport() {
  const user = useUser()
  const navigate = useNavigate()
  const { id } = useParams()
  const [report, reportLoading, reportError] = useDocument(
    doc(db, 'reports', id),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  )
  const [activeArtist, setActiveArtist] = useState(0)

  const onOpenArtist = (id) => {
    setActiveArtist(id)
  }

  if (reportLoading || reportError) {
    return (
      <VStack spacing={5} align="left">
      <HStack px={6} justifyContent='space-between'>
      <VStack spacing={3} align="left">
        <Skeleton isLoaded={!reportLoading}>
      <Heading size="md">Loading Report</Heading>
      </Skeleton>
      <Skeleton isLoaded={!reportLoading}>
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

  const reportData = report.data()
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
      created_on: reportData.created_on,
      created_by: reportData.created_by,
      type: 'artist',
      name: reportName,
      columnOrder: columnOrder,
      filterValue: filterValue
    })
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

  if (reportData)
  return (
    <>
    {activeArtist != 0 && 
    <PageLayoutContained size="lg">
      <ArtistDetail artistId={activeArtist} onNavigateBack={()=>setActiveArtist(0)}/>
      </PageLayoutContained>
    }
    <Box sx={{opacity:activeArtist!=0?0:1,height:activeArtist!=0?0:'auto'}} >
    <MuiDataGridController
    initialReportName={reportData.name} 
    initialColumnOrder={reportData.columnOrder} 
    initialFilterValues={reportData.filterValue} 
    onSave={onReportSave} 
    onSaveNew={onReportSaveNew} 
    onDelete={onReportDelete}
    onOpenArtist={onOpenArtist}
    />
    </Box>
    
    </>
  );
}

export default PageArtistReport;
