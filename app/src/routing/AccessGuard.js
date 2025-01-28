import { Navigate } from "react-router-dom";
import { useUser } from "./AuthGuard";
import PageUpgrade from "../pages/PageUpgrade";
import {useContext, useState} from "react";
import {ColumnDataContext} from "../App";
import {LoadingWidget} from "./LoadingScreen";

export default function AccessGuard({level = null, children}) {
  const user = useUser()
  const {organization} = useContext(ColumnDataContext)

  if (organization === null) {
    return <LoadingWidget/>;
  }

  if (organization.free_mode || organization.subscription !== null) {

    return <>{children}</>
  } else {
    return <PageUpgrade/>
  }
}
