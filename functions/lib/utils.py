import google
from firebase_functions.options import SupportedRegion
from google.auth.transport.requests import AuthorizedSession


def get_user(uid, db, as_dict = True):
    ref = db.collection("users").document(uid)
    doc = ref.get()
    if as_dict:
        data = doc.to_dict()
        return data
    return doc

def pop_default(input_list, default_value):
    try:
        return input_list.pop()
    except IndexError:
        return default_value

def get_function_url(name: str, location: str = SupportedRegion.US_CENTRAL1) -> str:
    """Get the URL of a given v2 cloud function.

    Params:
        name: the function's name
        location: the function's location

    Returns: The URL of the function
    """
    credentials, project_id = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"])
    authed_session = AuthorizedSession(credentials)
    url = ("https://cloudfunctions.googleapis.com/v2beta/" +
           f"projects/{project_id}/locations/{location}/functions/{name}")
    response = authed_session.get(url)
    data = response.json()
    function_url = data["serviceConfig"]["uri"]
    return function_url