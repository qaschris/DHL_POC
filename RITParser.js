const PulseSdk = require('@qasymphony/pulse-sdk');
const { Webhooks } = require('@qasymphony/pulse-sdk');
const request = require('request');
const xml2js = require('xml2js');

exports.handler = async function({ event: body, constants, triggers }, context, callback) {
    function emitEvent(name, payload) {
        let t = triggers.find(t => t.name === name);
        return t && new Webhooks().invoke(t, payload);
    }
    
    var payload = body;
    var projectId = payload.projectId;
    var testcycle = payload.testcycle;

    let testResults = Buffer.from(payload.result, 'base64').toString('ascii');

    var testLogs = [];

    xml2js.parseString(testResults, {
        preserveChildrenOrder: true,
        explicitArray: false,
        explicitChildren: false
    }, function (err, result) {
        if (err) {
            emitEvent('ChatOpsEvent', { message: "[ERROR]: Unexpected Error Parsing XML Document: " + err }); 
        } else {
        	console.log('[DEBUG]: ' + JSON.stringify(result));
            var testCases = Array.isArray(result.TestSuite.task.Test) ? result.TestSuite.task.Test : [result.TestSuite.task.Test]
            var suiteName = result.TestSuite.$.resource;
            testCases.forEach(function(test) {
                var testCaseName = test.$.testPath;
                var startingTime = test.$.startTime + 'Z';
                var endingTime = test.$.endTime + 'Z';
                var note = "";
                var sortedSteps = [];

                var testExecutions = Array.isArray(test.execute) ? test.execute : [test.execute];
                testExecutions.forEach(function(execution) {
                    //console.log('[DEBUG]: ' + JSON.stringify(execution));
                    var testCaseStatus = execution.$.iterationStatus;
                    var stepLog = [];
                    var testGroups = Array.isArray(Object.getOwnPropertyNames(execution)) ? Object.getOwnPropertyNames(execution) : [Object.getOwnPropertyNames(execution)];
                    testGroups.splice(testGroups.indexOf('$'), 1); // removes the $ properties from the array because we don't want to iterate it
                        testGroups.forEach(function(group) {
                            var stepGroup = Array.isArray(execution[group]) ? execution[group] : [execution[group]];
                            //console.log('[DEBUG]: ' + JSON.stringify(stepGroup));
                            stepGroup.forEach(function(step){
                                //console.log('[DEBUG]: ' + JSON.stringify(step));
                                let resultDescription = group + ': ';                                
                                if (group == 'iteration') {
                                    if (step.hasOwnProperty('subscribe')) {
                                        resultDescription = resultDescription + 'subscribe - ' + step.subscribe.$.technical;
                                    } 
                                    else if (step.hasOwnProperty('publish')) {
                                        resultDescription = resultDescription + 'publish - ' + step.publish.$.technical;
                                    }
                                }
                                else if (group == 'log') {
                                    resultDescription = resultDescription + step.$.technical.split('\n')[0]; //grab the first line of the log only
                                }
                                else { // runCommand, sqlQuery, everything else
                                    resultDescription = resultDescription + step.$.technical;
                                }
                                
                                let resultStatus = step.$.iterationStatus;
                                let resultStart = new Date(step.$.startTime);

                                sortedSteps.push({
                                    description: resultDescription,
                                    status: resultStatus,
                                    start: resultStart
                                })
                        })
                    });

                    sortedSteps.sort((a, b) => a.start - b.start); //sorting by start time to ensure proper step order in merged properties
                    console.log('[DEBUG]: ' + JSON.stringify(sortedSteps));
                    var resultStepOrder = 1;

                    sortedSteps.forEach(function(sortedStep) {
                        stepLog.push({
                            order: resultStepOrder++,
                            status: sortedStep.status,
                            description: sortedStep.description,
                            expected_result: sortedStep.description,
                            actual_result: sortedStep.description
                        });
                    });


                    var testLog = {
                        status: testCaseStatus,
                        name: testCaseName,
                        note: note,
                        attachments: [],
                        exe_start_date: startingTime,
                        exe_end_date: endingTime,
                        automation_content: testCaseName,
                        test_step_logs: stepLog,
                        module_names: [testCaseName]
                    };                    

                    for (var a = 0; a < payload.attachments.length; a++) {
                        testLog.attachments.push({
                            name: payload.attachments[a].name,
                            data: payload.attachments[a].data,
                            content_type: 'application/pdf'
                        });
                    }

                    testLogs.push(testLog);

                });
            });
        }
    });

    var formattedResults = {
        "projectId" : projectId,
        "testcycle" : testcycle,
        "logs" : testLogs
    };

    //emitEvent('ChatOpsEvent', { ResultsFormatSuccess: "Results formatted successfully for project" }); 
    emitEvent('UpdateQTestWithFormattedResults', formattedResults );
}
