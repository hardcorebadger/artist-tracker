import {GridToolbarContainer} from "@mui/x-data-grid-pro";
import {Button} from "@chakra-ui/react";

export default function ReportToolbar({}) {

    const handleClick = () => {

    };

    return (
        <GridToolbarContainer>
            <Button color="primary" onClick={handleClick}>
                Add record
            </Button>
        </GridToolbarContainer>
    );
}