import DataGrid2 from '../components/DataGrid2';
import { defaultColumnOrder, defaultColumnSelection, buildDefaultFilters, defaultReportName} from '../components/DataGridConfig';
import { setDoc, doc, getDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { useUser } from '../routing/AuthGuard';
import { useNavigate } from 'react-router-dom';

function PageHome() {
  const user = useUser()
  const navigate = useNavigate()

  const onReportSave = async (columnSelection, columnOrder, filterValue, reportName) => {
    const docRef = await addDoc(collection(db, 'reports'), {
      organization: user.org.id,
      type: 'artist',
      name: reportName,
      columnSelection: columnSelection,
      columnOrder: columnOrder,
      filterValue: filterValue
    })
    navigate('/app/reports/'+docRef.id)
  }

  return (
    <DataGrid2 initialReportName={defaultReportName} initialColumnSelection={defaultColumnSelection} initialColumnOrder={defaultColumnOrder} initialFilterValues={buildDefaultFilters()} onSave={onReportSave} />
  );
}

export default PageHome;
