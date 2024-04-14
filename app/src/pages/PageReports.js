import { PageLayoutContained } from '../layouts/DashboardLayout';
import ReportsList from '../components/ReportsList';

function PageReports() {

  return (
      <PageLayoutContained size="md">
        <ReportsList />
      </PageLayoutContained>
  );
}

export default PageReports;
