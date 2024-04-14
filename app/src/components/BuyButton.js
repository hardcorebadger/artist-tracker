import { Button } from "@chakra-ui/react"
import { Link as RouterLink } from "react-router-dom"
import { useUser } from '../routing/AuthGuard'
import { products } from '../config';

export default function BuyButton({product_id, overlay, children, ...other}) {
  const user = useUser()

  const fulllink = user ? products[product_id].checkout+"?checkout[custom][user_id]="+user.auth.uid+ "&checkout[email]="+ user.auth.email : products[product_id].checkout

  if (user && (product_id in user.products)) {
    return <Button isDisabled={true}>Current Plan</Button>
  }

  if (overlay) {
    return <Button {...other} onClick={()=>LemonSqueezy.Url.Open(fulllink)}>{children}</Button>
  } else {
    return <Button {...other} as={RouterLink} to={fulllink}>{children}</Button>
  }
}