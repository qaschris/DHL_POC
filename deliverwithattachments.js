const cp = require('child_process');
// This script requires the 'request' node.js module.
// This section grabs required node modules not packaged with
// the Automation Host service prior to executing the script.
const req = async module => {
    try {
        require.resolve(module);
    } catch (e) {
        console.log(`=== could not resolve "${module}" ===\n=== installing... ===`);
        cp.execSync(`npm install ${module}`);
        await setImmediate(() => {});
        console.log(`=== "${module}" has been installed ===`);
    }
    console.log(`=== requiring "${module}" ===`);
    try {
        return require(module);
    } catch (e) {
        console.log(`=== could not include "${module}" ===`);
        console.log(e);
        process.exit(1);
    }
}

const main = async () => {
    const { execSync } = await req("child_process");
    const fs = await req('fs');
    const path = await req('path');
    const request = await req('request');
    const util = require('util');

    const readDirAsync = util.promisify(fs.readdir);
    const readFileAsync = util.promisify(fs.readFile);
    const statAsync = util.promisify(fs.stat);

    const pulseUri = 'https://pulse-us-east-1.qtestnet.com/webhook/175751f1-e7f8-47df-9bbb-6662c68ab7f0'; // Pulse parser webhook endpoint
    const projectId = '74528'; // target qTest Project ID
    const cycleId = '5714304'; // target qTest Test Cycle ID

    // edit these to reflect your results file and Extent HTML attachment path, escape the slashes as seen below
    let resultsPath = 'C:\\repo\\- Customer Specific -\\DHL\\results';
    let attachmentsPath = 'C:\\repo\\- Customer Specific -\\DHL\\reports';
    let resultSuffix = '.xml';
    let attachmentSuffix = '.pdf';

    var result = '';
    let encodedAttachment;
    let encodedResults;
    let attachments = [];

   const readDirChronoSorted = async(dirpath, order, extension) => {
        const fileNamesArray = await new Promise(async(resolve, reject) => {
            order = order || 1;
            var files = await readDirAsync(dirpath);
            files = files.filter(function(file) {
                return path.extname(file).toLowerCase() === extension;
            });
            console.log('=== read path ' + dirpath + ' successfully ===');
            const stats = await Promise.all(
                files.map((filename) =>
                    statAsync(path.join(dirpath, filename))
                .then((stat) => ({ filename, stat }))
                )
            );
            resolve(stats.sort((a, b) =>
                order * (b.stat.ctime.getTime() - a.stat.ctime.getTime())
            ).map((stat) => stat.filename));
        })
        return fileNamesArray[0];
    }

    // Build command line for test execution.  Place any scripts surrounding build/test procedures here.
    // Comment out this section if build/test execution takes place elsewhere.
    /*
    let command = '';
    
    console.log(`=== executing command ===`);
    console.log(command);
    execSync(command, {stdio: "inherit"});
    console.log(`=== command completed ===`);
    */
    // Build section end.

    const readResults = async() => {
        await new Promise(async(resolve, reject) => {
            var filename = await readDirChronoSorted(resultsPath, 1, resultSuffix);
            console.log('=== inspecting file: ' + filename + ' ===');
            await readFileAsync(resultsPath + '\\' + filename, null, async function (err, data) {
                // base64 encode the results file
                var buff = new Buffer.from(data);
                encodedResults = buff.toString('base64');
                console.log('=== read results file ' + resultsPath + '\\' + filename + ' successfully ===');
                resolve('Read results successfully.');
                return;
            });
        });
    }

    const readAttachments = async() => {
        await new Promise(async(resolve, reject) => {
            var filename = await readDirChronoSorted(attachmentsPath, 1, attachmentSuffix);
            console.log('=== inspecting file: ' + filename + ' ===');
            await readFileAsync(attachmentsPath + '\\' + filename, null, async function (err, data) {
                attachment = data;
                // base64 encode the contents of the results file
                var buff = new Buffer.from(attachment);
                var base64data = buff.toString('base64');
                encodedAttachment = {
                    'name': filename,
                    'data': base64data
                }
                await attachments.push(encodedAttachment);
                console.log('=== read attachment file ' + attachmentsPath + '\\' + filename + ' successfully ===');
                resolve('Read attachment successfully.');
                return;
            });
        });
    }

    const deliverResults = async() => {
        await new Promise(async(resolve, reject) => {
            let opts = {
                    url: pulseUri,
                    json: true,
                    body: {
                        'projectId': projectId,
                        'testcycle': cycleId,
                        'result': encodedResults,
                        'attachments': attachments
                    }
                };
            // perform the post
            console.log('=== uploading results... ===')
            await request.post(opts, async function(err, response, resbody) {
                if (err) {
                    reject(err);
                } else {
                    //console.log(response);
                    //console.log(resbody);
                    console.log('=== uploaded results successfully ===')
                    resolve('Uploaded results successfully.');
                }
            });
        });
    }

    try {
        await readResults().then(async () => {
            //console.log("successfully read results");
            await readAttachments().then(async () => {
                //console.log("successfully read attachments");
                deliverResults().then(async () => {
                    //console.log('=== uploaded results successfully ===')
                });
            });
        }).catch((err) => {
            console.log(err);
        })
        /*.then(async() => {
            await readAttachments().then(async() => {                
                await deliverResults();
            });
        });*/
    } catch (err) {
        console.log('=== error: ', err.stack, ' ===');
    }
};

main();