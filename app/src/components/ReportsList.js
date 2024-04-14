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
  HStack,
} from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../routing/AuthGuard';
import { useCollection } from 'react-firebase-hooks/firestore';
import { db } from '../firebase';
import { collection, query, where } from 'firebase/firestore';
import { Link as ReactRouterLink } from 'react-router-dom'
import { format } from "date-fns"

export default function ReportsList() {

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

  const reportItems = reportError || reportsLoading ? null : reports.docs.map((d) => ({'id':d.id, 'name': d.data().name, 'creator':'wh@thehoops.co', 'last_modified':new Date(), 'path': '/app/reports/'+d.id}))


  return (
        <VStack spacing={10} align="left">
          <HStack justifyContent='space-between'>
          <Heading size="lg">My reports</Heading>
          <Button colorScheme='primary' as={ReactRouterLink} to='/app/reports/new'>New report</Button>
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
              <Tr key={item.id} sx={{'&:hover':{backgroundColor:'#e7fffa', cursor:'pointer'}}} onClick={()=>navigate(item.path)}>
                <Td>{item.name}</Td>
                <Td>{format(item.last_modified, 'yyyy-MM-dd')}</Td>
                <Td>{item.creator}</Td>
              </Tr>
              ))}
           </Tbody>
          </Table>
        </TableContainer>
        </Card>
        </VStack>
  );
}
