import { Navigate } from "react-router-dom";
import { useUser } from "./AuthGuard";
import PageUpgrade from "../pages/PageUpgrade";
import PageHome from "../pages/PageHome";
import Page404 from "../pages/Page404";

export default function AdminGuard({children}) {
  const user = useUser()

  if (!user.profile.admin) {
    return <Page404/>;
  } 

  return <>{children}</>
}
