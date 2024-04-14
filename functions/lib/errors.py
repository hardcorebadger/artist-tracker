import flask 
from firebase_functions import https_fn, scheduler_fn, tasks_fn, params, logger, options

CODE_TO_STATUS = {
https_fn.FunctionsErrorCode.OK: 200,
https_fn.FunctionsErrorCode.CANCELLED: 499,
https_fn.FunctionsErrorCode.UNKNOWN: 500,
https_fn.FunctionsErrorCode.INVALID_ARGUMENT: 400,
https_fn.FunctionsErrorCode.DEADLINE_EXCEEDED: 504,
https_fn.FunctionsErrorCode.NOT_FOUND: 404,
https_fn.FunctionsErrorCode.ALREADY_EXISTS: 409, 
https_fn.FunctionsErrorCode.PERMISSION_DENIED: 403,
https_fn.FunctionsErrorCode.UNAUTHENTICATED: 401,
https_fn.FunctionsErrorCode.RESOURCE_EXHAUSTED: 429,
https_fn.FunctionsErrorCode.FAILED_PRECONDITION: 400,
https_fn.FunctionsErrorCode.ABORTED: 409, 
https_fn.FunctionsErrorCode.OUT_OF_RANGE: 400,
https_fn.FunctionsErrorCode.UNIMPLEMENTED: 501,
https_fn.FunctionsErrorCode.INTERNAL: 500,
https_fn.FunctionsErrorCode.UNAVAILABLE: 503,
https_fn.FunctionsErrorCode.DATA_LOSS: 500
}

class ErrorResponse(Exception):
    def __init__(self, data=None, status_code=500, source="Internal"):
        super().__init__()
        self.data = data
        self.status_code = status_code
        self.source = source

    def to_json(self):
        return {'error': self.data, 'source':self.source, 'status': self.status_code}

    def respond(self):
        return flask.jsonify(self.to_json()), self.status_code
    
    def to_https_fn_error(self):
        code: https_fn.FunctionsErrorCode = https_fn.FunctionsErrorCode.UNKNOWN
        if self.status_code == 400:
            code = https_fn.FunctionsErrorCode.INVALID_ARGUMENT
        elif self.status_code == 401:
            code = https_fn.FunctionsErrorCode.UNAUTHENTICATED
        elif self.status_code == 403:
            code = https_fn.FunctionsErrorCode.PERMISSION_DENIED
        elif self.status_code == 404:
            code = https_fn.FunctionsErrorCode.NOT_FOUND
        elif self.status_code == 409:
            code = https_fn.FunctionsErrorCode.ALREADY_EXISTS
        elif self.status_code == 429:
            code = https_fn.FunctionsErrorCode.RESOURCE_EXHAUSTED
        elif self.status_code < 500:
            code = https_fn.FunctionsErrorCode.ABORTED
        return https_fn.HttpsError(code=code,message=code.name)