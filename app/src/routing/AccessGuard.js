import {Navigate, useLocation, useNavigate} from "react-router-dom";
import { useUser } from "./AuthGuard";
import PageUpgrade from "../pages/PageUpgrade";
import {useContext, useEffect, useState} from "react";
import {ColumnDataContext, ToastContext} from "../App";
import {LoadingWidget} from "./LoadingScreen";
import {useToast} from "@chakra-ui/react";

export default function AccessGuard({level = null, children}) {
  const user = useUser()
  const {organization} = useContext(ColumnDataContext)
  const toast = useToast();
  const loca = useLocation()

  const navigate = useNavigate()
  useEffect(() => {
    if (organization === null) {
      return
    }
    if (user.profile.admin && !(organization.free_mode || organization.subscription !== null)) {
      if (!toast.isActive("no-subscription")) {
        toast({
          id: "no-subscription",
          title: "Organization has no subscription.",
          description: "You are viewing this page as an admin, normal users will see the paywall.",

          status: "warning",
          duration: 5000,
          isClosable: true,
        });
      }
    }
  }, [organization, loca.pathname])
  if (organization === null) {
    return <LoadingWidget/>;
  }

  if ((organization.free_mode || organization.subscription !== null) || user.profile.admin) {

    return <>{children}</>
  } else {
    return <PageUpgrade/>
  }
}
