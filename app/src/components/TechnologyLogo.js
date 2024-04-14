import { Box, Image, withDefaultSize } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { chakra } from '@chakra-ui/react';
import chakraL  from '../resources/chakra.png';
import jwtL  from '../resources/jwt.png';
import laravelL from '../resources/laravel.png';
import reactL from '../resources/react.png';
import sendgridL from '../resources/sendgrid.png';
import stripeL from '../resources/stripe.png';
import lemonsqueezyL from '../resources/lemonsqueezy.png';
import firebaseL from '../resources/firebase.png';

export default function TechnologyLogo({name, size}) {
    let logo = ''
    switch (name){
        case 'chakra':logo=chakraL;break;
        case 'jwt':logo=jwtL;break;
        case 'laravel':logo=laravelL;break;
        case 'react':logo=reactL;break;
        case 'sendgrid':logo=sendgridL;break;
        case 'stripe':logo=stripeL;break;
        case 'lemonsqueezy':logo=lemonsqueezyL;break;
        case 'firebase':logo=firebaseL;break;
        default:logo='';break;
    }
    return (
        <Image src={logo} sx={{width:"100%", maxWidth:size, marginRight:'auto', marginLeft:'auto'}}/>
    );
}