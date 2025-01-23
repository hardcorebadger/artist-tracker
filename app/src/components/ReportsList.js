import {
  VStack,
  Button,
  Heading,
  Card,
  TableContainer,
  Table,
  TableCaption,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  HStack, useColorMode,
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../routing/AuthGuard';
import { useCollection } from 'react-firebase-hooks/firestore';
import { db } from '../firebase';
import { collection, query, where, addDoc } from 'firebase/firestore';
import { Link as ReactRouterLink } from 'react-router-dom'
import { format } from "date-fns"
import { defaultColumnOrder, defaultFilterModel, defaultReportName} from '../components/ColumnConfig';
import {useState, useContext} from 'react';
import UserAvatar from './UserAvatar'

export default function ReportsList() {

  const [createReportLoading, setCreateReportLoading] = useState(false)
  const {colorMode} = useColorMode()
  const user = useUser()
  const navigate = useNavigate()
  const [reports, reportsLoading, reportError] = useCollection(
    query(collection(db, 'reports'), 
      where("organization", "==", user.org.id),
    ),
    {
      snapshotListenOptions: { includeMetadataChanges: true },
    }
  )

  const reportItems = reportError || reportsLoading ? null : reports.docs.map((d) => ({'id':d.id, 'path': '/app/reports/'+d.id, ...d.data()}))

  const createReport = async () => {
    setCreateReportLoading(true)
    const docRef = await addDoc(collection(db, 'reports'), {
      organization: user.org.id,
      created_by: user.auth.uid,
      created_on: Date.now(),
      last_modified_on: Date.now(),
      last_modified_by: user.auth.uid,
      type: 'artist',
      name: defaultReportName,
      columnOrder: defaultColumnOrder,
      filterValue: defaultFilterModel
    })
    navigate('/app/reports/'+docRef.id)
    setCreateReportLoading(false)
  }

  return (
        <VStack spacing={10} align="left">
          <HStack justifyContent='space-between'>
          <Heading size="lg">My reports</Heading>
          <Button isLoading={createReportLoading} colorScheme='primary' onClick={createReport}>Create Report</Button>
          </HStack>
          <Card>
          <TableContainer>
          <Table variant='simple'>
            <TableCaption>You can see all reports for your organization</TableCaption>
            <Thead>
              <Tr>
                <Th>Report name</Th>
                <Th>Last modified</Th>
                <Th>Creator</Th>
              </Tr>
            </Thead>
            <Tbody>
              {reportItems && reportItems.map(item => (
              <Tr key={item.id} sx={{'&:hover':{backgroundColor:(colorMode === 'light' ? '#e7fffa' : '#1e3e43'), cursor:'pointer'}}} onClick={()=>navigate(item.path)}>
                <Td fontWeight='semibold'>{item.name}</Td>
                <Td>{format(Date(item.last_modified_on), 'yyyy-MM-dd')}</Td>
                <Td><UserAvatar userId={item.created_by}/></Td>
              </Tr>
              ))}
           </Tbody>
          </Table>
        </TableContainer>
        </Card>
        </VStack>
  );
} 
