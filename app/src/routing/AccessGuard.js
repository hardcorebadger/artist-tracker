import { Navigate } from "react-router-dom";
import { useUser } from "./AuthGuard";
import PageUpgrade from "../pages/PageUpgrade";

export default function AccessGuard({level, children}) {
  const user = useUser()

  if (!user.hasAccessLevel(level)) {
    return <PageUpgrade/>;
  } 

  return <>{children}</>
}
